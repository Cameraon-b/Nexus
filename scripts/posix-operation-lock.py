"""Reviewed Linux-only operation-lock server. Protocol contains no diagnostics.

Directory fds prevent redirection, not same-UID namespace renames. A per-UID,
per-project Linux abstract socket serializes official clients for the entire
operation, including across custody rename/recreate. No filesystem socket state.
"""
import errno
import hashlib
import json
import os
import re
import select
import socket
import stat
import sys

LIMIT = 65536
DIRECTORY = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def closed(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def receive(timeout):
    # Unbuffered fd reads avoid readline allocating unbounded hostile input.
    data = bytearray()
    while len(data) <= LIMIT:
        if not select.select([0], [], [], timeout)[0]:
            raise ValueError()
        chunk = os.read(0, 1)
        if not chunk:
            raise EOFError()
        if chunk == b'\n':
            return json.loads(data, object_pairs_hook=closed)
        data.extend(chunk)
    raise ValueError()


def emit(status, inputs=None):
    print(json.dumps({'status': status, **(inputs or {})}, separators=(',', ':')), flush=True)


def identity(s):
    # Python integers are exact; never round through a floating-point value.
    return (s.st_dev, s.st_ino, s.st_uid, stat.S_IMODE(s.st_mode))


def decimal(value):
    if not isinstance(value, str) or not re.fullmatch(r'0|[1-9][0-9]{0,19}', value):
        raise ValueError()
    return int(value)


def path(value):
    if not isinstance(value, str) or len(value) > 4096 or not value.startswith('/') or value.startswith('//') or '\x00' in value or os.path.normpath(value) != value:
        raise ValueError()
    return value


def owner_alive(owner):
    if not isinstance(owner, dict) or set(owner) != {'pid', 'start'}:
        raise ValueError()
    pid, start = decimal(owner['pid']), decimal(owner['start'])
    if pid <= 0 or start <= 0:
        raise ValueError()
    try:
        with open('/proc/'+str(pid)+'/stat', 'r', encoding='ascii') as source:
            fields = source.read(8192).rsplit(') ', 1)[1].split()
        return fields[19] == str(start) and fields[0] not in ('Z', 'X')
    except FileNotFoundError:
        return False


def owner_bytes(token, owner):
    return (json.dumps({'version': 1, 'token': token, **owner}, separators=(',', ':'))+'\n').encode('ascii')


class Transaction:
    def __init__(self, request):
        if not isinstance(request, dict) or set(request) - {'candidate'} != {'version', 'action', 'custody', 'directory', 'config', 'bindings', 'key', 'token', 'owner'}:
            raise ValueError()
        if type(request['version']) is not int or request['version'] != 1 or request['action'] not in ('acquire', 'recover'):
            raise ValueError()
        self.candidate = request.get('candidate')
        self.memberfds = []
        self.memberbindings = []
        self.owner = request['owner']
        if request['action'] == 'acquire' and not owner_alive(self.owner):
            raise ValueError()
        self.custody = path(request['custody'])
        self.rootpath = path(request['directory'])
        self.config = path(request['config'])
        if self.custody == '/' or self.rootpath != self.custody+'/.nexus-production-locks' or not self.config.startswith(self.custody+'/'):
            raise ValueError()
        self.key, self.token = request['key'], request['token']
        if not isinstance(self.key, str) or not re.fullmatch('[a-f0-9]{64}\\.lock', self.key):
            raise ValueError()
        if not isinstance(self.token, str) or not re.fullmatch('owner-[a-f0-9]{64}\\.json', self.token):
            raise ValueError()
        bindings = request['bindings']
        if not isinstance(bindings, list) or not 1 <= len(bindings) <= 256:
            raise ValueError()
        self.expected = {}
        for item in bindings:
            if not isinstance(item, dict) or set(item) != {'path', 'device', 'inode', 'uid', 'mode'}:
                raise ValueError()
            name = path(item['path'])
            if name in self.expected:
                raise ValueError()
            self.expected[name] = tuple(decimal(item[k]) for k in ['device', 'inode', 'uid', 'mode'])
        for name in [self.custody, os.path.dirname(self.config), *list(self.expected)]:
            while True:
                if name not in self.expected:
                    raise ValueError()
                if name == '/':
                    break
                name = os.path.dirname(name)
        self.fds = {}
        self.snapshots = {}
        self.created = False
        self.uid = os.getuid()
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        # Deliberately stricter than context-specific serialization: all Docker
        # contexts in this Linux network namespace contend on the same project.
        self.socket.bind('\0nexus-operation-v1-'+str(self.uid)+'-'+self.key[:-5])
        self.socket.listen(1)

    def private(self, name, s):
        if not stat.S_ISDIR(s.st_mode):
            raise ValueError()
        protected = name == self.custody or name.startswith(self.custody+'/')
        if protected:
            if s.st_uid != self.uid or s.st_mode & 0o022:
                raise ValueError()
        elif s.st_uid not in (0, self.uid) or s.st_mode & 0o022:
            raise ValueError()

    def pin(self, name):
        if name in self.fds:
            return self.fds[name]
        if name == '/':
            fd = os.open('/', DIRECTORY)
        else:
            parent = self.pin(os.path.dirname(name))
            fd = os.open(os.path.basename(name), DIRECTORY, dir_fd=parent)
        self.fds[name] = fd
        s = os.fstat(fd)
        self.private(name, s)
        if identity(s) != self.expected[name]:
            raise ValueError()
        self.snapshots[name] = identity(s)
        return fd

    def immutable(self, fd, directory):
        s = os.fstat(fd)
        if s.st_uid != self.uid or stat.S_IMODE(s.st_mode) != (0o500 if directory else 0o400):
            raise ValueError()
        if any(a in os.listxattr(fd) for a in ('system.posix_acl_access', 'system.posix_acl_default')):
            raise ValueError()

    def verify(self):
        for fd, original, digest in self.memberbindings:
            self.immutable(fd, False)
            s = os.fstat(fd)
            if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or original != (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns):
                raise ValueError()
            data = os.pread(fd, s.st_size + 1, 0)
            if len(data) != s.st_size or hashlib.sha256(data).hexdigest() != digest:
                raise ValueError()
        for name, fd in self.fds.items():
            if self.candidate is not None and (name == self.candidate['root'] or name.startswith(self.candidate['root']+'/')):
                self.immutable(fd, True)
            s = os.fstat(fd)
            self.private(name, s)
            if identity(s) != self.snapshots[name]:
                raise ValueError()
            if name != '/':
                named = os.stat(os.path.basename(name), dir_fd=self.fds[os.path.dirname(name)], follow_symlinks=False)
                if not stat.S_ISDIR(named.st_mode) or identity(named) != identity(s):
                    raise ValueError()

    def prepare(self):
        for name in self.expected:
            self.pin(name)
        self.verify()
        self.configfd = os.open(os.path.basename(self.config), os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.fds[os.path.dirname(self.config)])
        configstat = os.fstat(self.configfd)
        if not stat.S_ISREG(configstat.st_mode) or configstat.st_nlink != 1 or configstat.st_uid != self.uid or configstat.st_mode & 0o022:
            raise ValueError()
        self.configid = identity(configstat)
        candidates = [name for name in self.fds if re.fullmatch(re.escape(self.custody)+r'/tools/candidates/[^/]+', name)]
        if len(candidates) != 1:
            raise ValueError()
        if self.candidate is not None:
            self.bind_candidate(candidates[0])
        prefix = '/proc/'+str(os.getpid())+'/fd/'
        self.inputs = {'config': prefix+str(self.configfd), 'candidate': prefix+str(self.fds[candidates[0]])}

    def bind_candidate(self, root):
        binding = self.candidate
        if set(binding) != {'root', 'files', 'directories'} or binding['root'] != root:
            raise ValueError()
        files = binding['files']
        if not isinstance(files, list) or not 2 <= len(files) <= 258:
            raise ValueError()
        expected = set()
        snapshots = {}
        total = 0
        for item in files:
            if set(item) != {'path', 'device', 'inode', 'size', 'hash'}:
                raise ValueError()
            name = item['path']
            if not isinstance(name, str) or len(name) > 240 or any(p in ('', '.', '..') for p in name.split('/')) or '\\' in name or '\x00' in name or name in expected:
                raise ValueError()
            expected.add(name)
            parent = os.path.dirname(root+'/'+name)
            fd = os.open(os.path.basename(name), os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.fds[parent])
            self.memberfds.append(fd)
            self.immutable(fd, False)
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or (before.st_dev, before.st_ino, before.st_size) != tuple(decimal(item[k]) for k in ('device', 'inode', 'size')) or before.st_size > 16777216:
                raise ValueError()
            total += before.st_size
            if total > 67108864:
                raise ValueError()
            digest = hashlib.sha256()
            remaining = before.st_size
            while remaining:
                chunk = os.read(fd, min(65536, remaining))
                if not chunk:
                    raise ValueError()
                digest.update(chunk)
                remaining -= len(chunk)
            after = os.fstat(fd)
            snapshots[name] = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            self.memberbindings.append((fd, snapshots[name], item['hash']))
            if digest.hexdigest() != item['hash'] or os.read(fd, 1) or (before.st_mtime_ns, before.st_ctime_ns, before.st_nlink) != (after.st_mtime_ns, after.st_ctime_ns, after.st_nlink):
                raise ValueError()
        found = set()
        def inventory(directory, prefix=''):
            with os.scandir(self.fds[directory]) as entries:
                for entry in entries:
                    name = prefix+entry.name
                    if entry.is_dir(follow_symlinks=False):
                        child = directory+'/'+entry.name
                        if child not in self.fds or not any(p.startswith(name+'/') for p in expected):
                            raise ValueError()
                        inventory(child, name+'/')
                    else:
                        if name not in expected or name in found:
                            raise ValueError()
                        s = entry.stat(follow_symlinks=False)
                        if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or snapshots[name] != (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns):
                            raise ValueError()
                        found.add(name)
        inventory(root)
        if found != expected:
            raise ValueError()

    def recover(self):
        self.prepare()
        custody = self.fds[self.custody]
        try:
            root = self.fds.get(self.rootpath)
            if root is None:
                root = os.open('.nexus-production-locks', DIRECTORY, dir_fd=custody)
                self.fds[self.rootpath] = root
                self.private(self.rootpath, os.fstat(root))
                self.snapshots[self.rootpath] = identity(os.fstat(root))
        except FileNotFoundError:
            self.verify()
            return 'absent'
        if stat.S_IMODE(os.fstat(root).st_mode) != 0o700:
            raise ValueError()
        self.verify()
        try:
            self.lockfd = os.open(self.key, DIRECTORY, dir_fd=root)
        except FileNotFoundError:
            self.verify()
            return 'absent'
        self.lockid = identity(os.fstat(self.lockfd))
        entries = os.listdir(self.lockfd)
        if not entries:
            s = os.fstat(self.lockfd)
            self.private(self.rootpath+'/'+self.key, s)
            if stat.S_IMODE(s.st_mode) != 0o700:
                raise ValueError()
            self.verify()
            named = os.stat(self.key, dir_fd=root, follow_symlinks=False)
            if identity(named) != self.lockid or os.listdir(self.lockfd):
                raise ValueError()
            self.created = True
            os.rmdir(self.key, dir_fd=root)
            try:
                os.stat(self.key, dir_fd=root, follow_symlinks=False)
            except FileNotFoundError:
                pass
            else:
                raise ValueError()
            os.fsync(root)
            self.verify()
            return 'recovered'
        if len(entries) != 1 or not re.fullmatch('owner-[a-f0-9]{64}\\.json', entries[0]):
            raise ValueError()
        self.token = entries[0]
        self.ownerfd = os.open(self.token, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.lockfd)
        self.ownerid = identity(os.fstat(self.ownerfd))
        raw = os.pread(self.ownerfd, 1025, 0)
        record = json.loads(raw, object_pairs_hook=closed)
        if not isinstance(record, dict) or set(record) != {'version', 'token', 'pid', 'start'} or type(record['version']) is not int or record['version'] != 1 or record['token'] != self.token:
            raise ValueError()
        owner = {k: record[k] for k in ['pid', 'start']}
        self.ownerbytes = owner_bytes(self.token, owner)
        if raw != self.ownerbytes or owner_alive(owner):
            raise ValueError()
        self.verify_lock()
        # The abstract socket is held exclusively before any descriptor opens.
        # Only the exact closed state above is eligible for removal.
        self.created = True
        self.release()
        return 'recovered'

    def acquire(self):
        self.prepare()
        custody = self.fds[self.custody]
        # Mark uncertainty before the first mutating syscall, not afterward.
        prior = self.created
        self.created = True
        try:
            os.mkdir('.nexus-production-locks', 0o700, dir_fd=custody)
            os.fsync(custody)
        except FileExistsError:
            self.created = prior
        if self.rootpath not in self.fds:
            root = os.open('.nexus-production-locks', DIRECTORY, dir_fd=custody)
            self.fds[self.rootpath] = root
            s = os.fstat(root)
            self.private(self.rootpath, s)
            self.snapshots[self.rootpath] = identity(s)
        root = self.fds[self.rootpath]
        if stat.S_IMODE(os.fstat(root).st_mode) != 0o700:
            raise ValueError()
        self.verify()
        self.created = True
        try:
            os.mkdir(self.key, 0o700, dir_fd=root)
        except FileExistsError:
            return 'locked'
        os.fsync(root)
        # Linux has no atomic mkdir+open. Both calls are descriptor-relative;
        # a same-UID hostile writer remains outside the security boundary.
        self.lockfd = os.open(self.key, DIRECTORY, dir_fd=root)
        s = os.fstat(self.lockfd)
        self.private(self.rootpath+'/'+self.key, s)
        if stat.S_IMODE(s.st_mode) != 0o700:
            raise ValueError()
        self.lockid = identity(s)
        self.ownerfd = os.open(self.token, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=self.lockfd)
        if not owner_alive(self.owner):
            raise ValueError()
        self.ownerbytes = owner_bytes(self.token, self.owner)
        if os.write(self.ownerfd, self.ownerbytes) != len(self.ownerbytes):
            raise ValueError()
        os.fsync(self.ownerfd)
        os.fsync(self.lockfd)
        self.ownerid = identity(os.fstat(self.ownerfd))
        self.verify_lock()
        return 'acquired'

    def verify_lock(self):
        self.verify()
        configstat = os.stat(os.path.basename(self.config), dir_fd=self.fds[os.path.dirname(self.config)], follow_symlinks=False)
        if not stat.S_ISREG(configstat.st_mode) or configstat.st_nlink != 1 or identity(configstat) != self.configid or identity(os.fstat(self.configfd)) != self.configid:
            raise ValueError()
        root = self.fds[self.rootpath]
        for fd, parent, name, expected, mode, directory in [
            (self.lockfd, root, self.key, self.lockid, 0o700, True),
            (self.ownerfd, self.lockfd, self.token, self.ownerid, 0o600, False),
        ]:
            s = os.fstat(fd)
            named = os.stat(name, dir_fd=parent, follow_symlinks=False)
            if identity(s) != expected or identity(named) != expected or s.st_uid != self.uid or stat.S_IMODE(s.st_mode) != mode:
                raise ValueError()
            if directory:
                if not stat.S_ISDIR(named.st_mode):
                    raise ValueError()
            elif not stat.S_ISREG(named.st_mode) or s.st_nlink != 1 or named.st_nlink != 1 or s.st_size != len(self.ownerbytes) or os.pread(fd, len(self.ownerbytes)+1, 0) != self.ownerbytes:
                raise ValueError()
        if os.listdir(self.lockfd) != [self.token]:
            raise ValueError()

    def release(self):
        self.verify_lock()
        os.unlink(self.token, dir_fd=self.lockfd)
        try:
            os.stat(self.token, dir_fd=self.lockfd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise ValueError()
        os.fsync(self.lockfd)
        if os.listdir(self.lockfd):
            raise ValueError()
        self.verify()
        named = os.stat(self.key, dir_fd=self.fds[self.rootpath], follow_symlinks=False)
        if identity(named) != self.lockid:
            raise ValueError()
        os.rmdir(self.key, dir_fd=self.fds[self.rootpath])
        try:
            os.stat(self.key, dir_fd=self.fds[self.rootpath], follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise ValueError()
        os.fsync(self.fds[self.rootpath])
        self.verify()

    def close(self):
        for fd in {*self.fds.values(), *self.memberfds, *(getattr(self, name) for name in ['configfd', 'lockfd', 'ownerfd'] if hasattr(self, name))}:
            os.close(fd)
        self.socket.close()


def main():
    transaction = None
    acquired = False
    try:
        os.umask(0o077)
        request = receive(30)
        try:
            transaction = Transaction(request)
        except OSError as error:
            if error.errno == errno.EADDRINUSE:
                emit('locked')
                return
            raise
        if request['action'] == 'recover':
            emit(transaction.recover())
            return
        status = transaction.acquire()
        emit(status, transaction.inputs if status == 'acquired' else None)
        if status != 'acquired':
            return
        acquired = True
        # No operation-duration timeout: caller holds stdin for its lifetime.
        if receive(None) != {'action': 'release'}:
            raise ValueError()
        transaction.release()
        emit('released')
    except BaseException:
        # Never expose exception strings, paths, tokens, PIDs or hostnames.
        emit('cleanup' if acquired or (transaction and transaction.created) else 'refused')
    finally:
        if transaction:
            try:
                transaction.close()
            except BaseException:
                emit('cleanup')


if __name__ == '__main__':
    main()
