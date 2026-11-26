"""Offline real-Linux protocol tests; all fixtures are disposable and synthetic."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest
import types
from unittest.mock import patch

HELPER = Path(__file__).with_name('posix-operation-lock.py')

class Locks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='nexus-round11-', dir=Path.home())
        self.base = Path(self.temp.name)
        self.custody = self.base / 'custody'
        self.candidate = self.custody / 'tools/candidates/a'
        self.candidate.mkdir(parents=True, mode=0o700)
        self.config = self.custody / 'private/a/env'
        self.config.parent.mkdir(parents=True, mode=0o700)
        self.config.write_text('synthetic')
        self.processes = []
        self.key = hashlib.sha256(self.temp.name.encode()).hexdigest()
    def tearDown(self):
        for p in self.processes:
            if p.poll() is None:
                p.stdin.close()
                p.wait(timeout=5)
            p.stdin.close()
            p.stdout.close()
            p.stderr.close()
        self.temp.cleanup()
    def request(self, project=None):
        paths = set()
        for start in [self.custody, self.candidate, self.config.parent]:
            paths.add(start)
            paths.update(start.parents)
        root = self.custody / '.nexus-production-locks'
        if root.exists():
            paths.add(root)
        return dict(version=1, action='acquire', owner=dict(pid=str(os.getpid()), start=Path('/proc/self/stat').read_text().rsplit(') ', 1)[1].split()[19]), custody=str(self.custody), directory=str(root),
                    config=str(self.config), bindings=[dict(path=str(p), device=str(p.stat().st_dev), inode=str(p.stat().st_ino), uid=str(p.stat().st_uid), mode=str(stat.S_IMODE(p.stat().st_mode))) for p in paths],
                    key=(project or self.key)+'.lock', token='owner-'+'a'*64+'.json')
    def start(self, request=None):
        # Execute bytes, never a mutable helper pathname.
        p = subprocess.Popen(['python3', '-I', '-u', '-c', HELPER.read_text()], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.processes.append(p)
        p.stdin.write(json.dumps(request or self.request())+'\n'); p.stdin.flush()
        result = json.loads(p.stdout.readline())
        if result.get('status') == 'acquired':
            self.assertEqual(set(result), {'status', 'config', 'candidate'})
            self.assertTrue(result['config'].startswith('/proc/'+str(p.pid)+'/fd/'))
            self.assertTrue(result['candidate'].startswith('/proc/'+str(p.pid)+'/fd/'))
            result = {'status': 'acquired'}
        return p, result
    def release(self, p):
        p.stdin.write('{"action":"release"}\n'); p.stdin.flush()
        result = json.loads(p.stdout.readline())
        p.wait(timeout=5)
        self.assertEqual(p.stderr.read(), '')
        return result['status']
    def test_acquire_release_stale_and_projects(self):
        before = hashlib.sha256(self.config.read_bytes()).hexdigest()
        p, result = self.start(); self.assertEqual(result, {'status':'acquired'})
        self.assertEqual(self.start()[1], {'status':'locked'})
        q, result = self.start(self.request('b'*64)); self.assertEqual(result, {'status':'acquired'})
        self.assertEqual(self.release(q), 'released')
        self.assertEqual(self.release(p), 'released')
        self.assertEqual(before, hashlib.sha256(self.config.read_bytes()).hexdigest())
        p, _ = self.start(); p.stdin.close(); p.wait(timeout=5)
        self.assertEqual(self.start()[1], {'status':'locked'})
    def test_candidate_config_and_rename_global_contention(self):
        p, _ = self.start()
        moved = self.base / 'old'; self.custody.rename(moved)
        self.candidate.mkdir(parents=True); self.config.parent.mkdir(parents=True); self.config.write_text('replacement')
        self.assertEqual(self.start()[1], {'status':'locked'})
        self.assertFalse((self.custody / '.nexus-production-locks').exists())
        self.assertEqual(self.release(p), 'cleanup')
        self.assertTrue((moved / '.nexus-production-locks' / (self.key+'.lock')).exists())
    def test_permissions_and_symlinks(self):
        for target in [self.custody, self.config.parent]:
            target.chmod(0o777)
            self.assertEqual(self.start()[1], {'status':'refused'})
            target.chmod(0o700)
        request = self.request()
        original = self.config.parent
        moved = original.with_name('moved'); original.rename(moved); original.symlink_to(moved, target_is_directory=True)
        self.assertEqual(self.start(request)[1], {'status':'refused'})
    def test_existing_lock_root_permissions_and_type(self):
        root = self.custody/'.nexus-production-locks'
        for mode in [0o777, 0o770, 0o755]:
            root.mkdir(mode=0o700); root.chmod(mode)
            self.assertEqual(self.start()[1], {'status':'refused'})
            root.rmdir()
        root.write_text('not a directory')
        self.assertEqual(self.start()[1], {'status':'refused'})
        root.unlink()
        root.symlink_to(self.config.parent, target_is_directory=True)
        self.assertEqual(self.start()[1], {'status':'refused'})
    def test_release_evidence(self):
        mutations = ['extra', 'hardlink', 'replace', 'mode', 'rootmode', 'lockreplace', 'tokensymlink', 'content', 'ownermode']
        if os.geteuid() == 0: mutations.append('owneruid')
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                p, _ = self.start()
                root = self.custody / '.nexus-production-locks'
                lock = root / (self.key+'.lock'); token = next(lock.iterdir())
                if mutation == 'extra': (lock/'unknown').write_text('keep')
                if mutation == 'hardlink': os.link(token, self.base/'linked')
                if mutation == 'replace':
                    token.rename(self.base/'original'); token.write_text('replacement')
                if mutation == 'lockreplace':
                    lock.rename(root/'old-lock'); lock.mkdir(mode=0o700); token = lock/token.name; token.write_text('replacement')
                if mutation == 'tokensymlink':
                    token.rename(self.base/'original'); token.symlink_to(self.base/'original')
                if mutation == 'content': token.write_text('z'*token.stat().st_size)
                if mutation == 'ownermode': token.chmod(0o640)
                if mutation == 'mode': lock.chmod(0o755)
                if mutation == 'rootmode': root.chmod(0o755)
                if mutation == 'owneruid': os.chown(token, 65534, 65534)
                self.assertEqual(self.release(p), 'cleanup')
                self.assertTrue(token.exists())
                shutil.rmtree(root)
    def transaction(self):
        module = types.ModuleType('reviewed_lock')
        exec(compile(HELPER.read_text(), str(HELPER), 'exec'), module.__dict__)
        t = module.Transaction(self.request())
        self.addCleanup(t.close)
        return t
    def test_deterministic_custody_swap_during_mkdir(self):
        t = self.transaction()
        mkdir = os.mkdir
        old = self.base/'old'
        def swap(name, *args, **kwargs):
            if name == '.nexus-production-locks':
                self.custody.rename(old)
                mkdir(self.custody)
            return mkdir(name, *args, **kwargs)
        with patch.object(os, 'mkdir', swap), self.assertRaises(ValueError):
            t.acquire()
        self.assertTrue(t.created)
        self.assertFalse((self.custody/'.nexus-production-locks').exists())
        self.assertTrue((old/'.nexus-production-locks').exists())
    def test_symlink_swap_after_root_pin(self):
        t = self.transaction()
        mkdir = os.mkdir
        replacement = self.base/'replacement'; replacement.mkdir()
        def swap(name, *args, **kwargs):
            if name == t.key:
                self.custody.rename(self.base/'old')
                self.custody.symlink_to(replacement, target_is_directory=True)
            return mkdir(name, *args, **kwargs)
        with patch.object(os, 'mkdir', swap), self.assertRaises(ValueError):
            t.acquire()
        self.assertTrue(t.created)
        self.assertEqual(list(replacement.iterdir()), [])
    def test_uncertain_mkdir_reports_cleanup(self):
        module = types.ModuleType('reviewed_lock')
        exec(compile(HELPER.read_text(), str(HELPER), 'exec'), module.__dict__)
        mkdir = os.mkdir
        output = []
        def fault(name, *args, **kwargs):
            mkdir(name, *args, **kwargs)
            raise OSError('private-path diagnostic')
        request = self.request()
        with patch.object(module, 'receive', return_value=request), patch.object(module, 'emit', output.append), patch.object(os, 'mkdir', fault):
            module.main()
        self.assertEqual(output, ['cleanup'])
        self.assertTrue((self.custody/'.nexus-production-locks').exists())
    def test_release_noop_and_failure_evidence(self):
        for method in ['unlink', 'rmdir']:
            for noop in [True, False]:
                with self.subTest(method=method, noop=noop):
                    t = self.transaction(); self.assertEqual(t.acquire(), 'acquired')
                    def fault(*args, **kwargs):
                        if not noop: raise OSError('private diagnostic')
                    with patch.object(os, method, fault), self.assertRaises((ValueError, OSError)):
                        t.release()
                    lock = self.custody/'.nexus-production-locks'/(self.key+'.lock')
                    self.assertTrue(lock.is_dir())
                    if method == 'unlink': self.assertTrue((lock/t.token).exists())
                    t.close(); self._cleanups.pop()
                    shutil.rmtree(self.custody/'.nexus-production-locks')
    def test_wrong_uid_and_bound_mode_drift(self):
        request = self.request()
        self.custody.chmod(0o750)
        self.assertEqual(self.start(request)[1], {'status':'refused'})
        self.custody.chmod(0o700)
        if os.geteuid() == 0:
            os.chown(self.custody, 65534, 65534)
            self.assertEqual(self.start()[1], {'status':'refused'})
            os.chown(self.custody, 0, 0)
        t = self.transaction()
        t.uid += 1
        with self.assertRaises(ValueError): t.acquire()
    def test_recovery_active_stale_absent(self):
        owner = subprocess.Popen(['python3', '-c', 'import time; time.sleep(60)'])
        try:
            request = self.request()
            request['owner'] = dict(pid=str(owner.pid), start=Path('/proc/'+str(owner.pid)+'/stat').read_text().rsplit(') ', 1)[1].split()[19])
            p, result = self.start(request)
            self.assertEqual(result, {'status': 'acquired'})
            request = {**self.request(), 'owner': request['owner'], 'action': 'recover'}
            self.assertEqual(self.start(request)[1], {'status': 'locked'})
            p.kill(); p.wait(timeout=5)
            self.assertEqual(self.start(request)[1], {'status': 'refused'})
            owner.kill(); owner.wait(timeout=5)
            self.assertEqual(self.start(request)[1], {'status': 'recovered'})
            self.assertEqual(self.start(request)[1], {'status': 'absent'})
        finally:
            if owner.poll() is None:
                owner.kill(); owner.wait(timeout=5)

    def test_recovery_bound_replacement_and_cleanup_failure(self):
        for fault in ['replacement', 'extra', 'malformed', 'unlink', 'rmdir']:
            with self.subTest(fault=fault):
                owner = self.transaction(); self.assertEqual(owner.acquire(), 'acquired')
                owner.close(); self._cleanups.pop()
                token = self.custody/'.nexus-production-locks'/owner.key/owner.token
                token.write_text(json.dumps(dict(version=1, token=owner.token, pid=str(os.getpid()), start='1'), separators=(',', ':'))+'\n')
                recovery = self.transaction()
                token = self.custody/'.nexus-production-locks'/recovery.key/recovery.token
                if fault == 'extra': (token.parent/'unknown').write_text('keep')
                if fault == 'malformed': token.write_text('unknown')
                original = recovery.verify_lock
                def replaced():
                    token.rename(token.with_name('evidence'))
                    token.write_text(recovery.token+'\n')
                    original()
                if fault == 'replacement':
                    with patch.object(recovery, 'verify_lock', replaced), self.assertRaises(ValueError):
                        recovery.recover()
                elif fault in ['unlink', 'rmdir']:
                    with patch.object(os, fault, lambda *a, **k: None), self.assertRaises(ValueError):
                        recovery.recover()
                else:
                    with self.assertRaises(ValueError): recovery.recover()
                self.assertTrue(token.parent.exists())
                if fault != 'rmdir': self.assertTrue(token.exists())
                recovery.close(); self._cleanups.pop()
                shutil.rmtree(self.custody/'.nexus-production-locks')

    def test_recovery_helper_cleanup_failure_is_not_success(self):
        module = types.ModuleType('reviewed_lock')
        exec(compile(HELPER.read_text(), str(HELPER), 'exec'), module.__dict__)
        request = self.request(); request['action'] = 'recover'
        output = []
        original = module.Transaction.close
        def fault(t):
            original(t)
            raise OSError('private cleanup diagnostic')
        with patch.object(module, 'receive', return_value=request), patch.object(module, 'emit', output.append), patch.object(module.Transaction, 'close', fault):
            module.main()
        self.assertEqual(output, ['absent', 'cleanup'])

    def test_closed_protocol(self):
        request = self.request(); request['extra'] = 'not allowed'
        self.assertEqual(self.start(request)[1], {'status':'refused'})
        for data in ['{"version":1,"version":1}\n', 'x'*65537+'\n', '{"action":"acquire","fault":true}\n']:
            result = subprocess.run(['python3', '-I', '-u', '-c', HELPER.read_text()], input=data, text=True, capture_output=True, timeout=5)
            self.assertEqual(result.stdout, '{"status":"refused"}\n')
            self.assertEqual(result.stderr, '')

if __name__ == '__main__':
    unittest.main()
