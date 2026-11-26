# Closed-schema, exact-identity operation lock transaction. No external diagnostics.
$ErrorActionPreference = 'Stop'
try {
    Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
public static class NexusOperationLock {
    [StructLayout(LayoutKind.Sequential)] struct Time { public uint Low, High; }
    [StructLayout(LayoutKind.Sequential)] struct Info { public uint Attributes; public Time Created, Accessed, Written; public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow; }
    [StructLayout(LayoutKind.Sequential)] struct Disposition { public byte Delete; }
    [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
    [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes { public int Length; public IntPtr RootDirectory, ObjectName; public uint Attributes; public IntPtr SecurityDescriptor, SecurityQualityOfService; }
    [StructLayout(LayoutKind.Sequential)] struct IoStatus { public IntPtr Status; public UIntPtr Information; }
    [DllImport("ntdll.dll")] static extern int NtCreateFile(out SafeFileHandle handle,uint access,ref ObjectAttributes attributes,out IoStatus status,IntPtr allocation,uint fileAttributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sec,uint c,uint f,IntPtr t);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int k,ref Disposition d,uint s);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeWaitHandle CreateSemaphoreW(IntPtr security,int initial,int maximum,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern SafeFileHandle OpenProcess(uint access,bool inherit,int pid);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(SafeFileHandle process,out Time created,out Time exited,out Time kernel,out Time user);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr source,IntPtr targetProcess,out SafeWaitHandle target,uint access,bool inherit,uint options);
    static SafeFileHandle OwnerHandle(object value) {
        var owner=Fields(value,"pid","start");int pid;Need(Int32.TryParse(Number(owner["pid"]),out pid)&&pid>0);
        var handle=OpenProcess(0x1040,false,pid);
        try { Time created=new Time(),exited,kernel,user;Need(!handle.IsInvalid&&GetProcessTimes(handle,out created,out exited,out kernel,out user));Need((((ulong)created.High<<32)|created.Low).ToString()==Number(owner["start"]));return handle; }
        catch { handle.Dispose();throw; }
    }
    static void Need(bool b) { if(!b)throw new InvalidOperationException(); }
    static Dictionary<string,object> Fields(object o,params string[] keys) { var d=o as Dictionary<string,object>;Need(d!=null&&d.Count==keys.Length);foreach(string k in keys)Need(d.ContainsKey(k));return d; }
    static string Text(object o) { var s=o as string;Need(s!=null&&s.Length>0&&s.Length<4096&&s.IndexOf('\0')<0);return s; }
    static string PathText(object o) { string p=Text(o);Need(System.Text.RegularExpressions.Regex.IsMatch(p,@"\A[A-Za-z]:\\")&&p.IndexOf(':',2)<0&&!System.Text.RegularExpressions.Regex.IsMatch(p,@"(?:^|\\)\.{1,2}(?:\\|$)"));return p; }
    static string Number(object o) { string s=Text(o);ulong n;Need(System.Text.RegularExpressions.Regex.IsMatch(s,@"\A(?:0|[1-9][0-9]{0,19})\z")&&UInt64.TryParse(s,out n));return s; }
    static Dictionary<string,object> Id(Info i) { return new Dictionary<string,object>{{"device",i.Volume.ToString()},{"inode",(((ulong)i.IndexHigh<<32)|i.IndexLow).ToString()}}; }
    static void Match(Info i,object expected) { var d=Fields(expected,"device","inode");Need(Number(d["device"])==i.Volume.ToString()&&Number(d["inode"])==(((ulong)i.IndexHigh<<32)|i.IndexLow).ToString()); }
    static Info Information(SafeFileHandle h,bool directory) { Info i=new Info();Need(!h.IsInvalid&&GetFileInformationByHandle(h,out i));Need((i.Attributes&0x400)==0&&((i.Attributes&0x10)!=0)==directory);if(!directory)Need(i.Links==1);return i; }
    static SafeFileHandle Open(string p,bool directory,bool delete) { var h=CreateFileW(p,(0x80020080u|(delete?0x10000u:0u)),1,IntPtr.Zero,3,0x02200000,IntPtr.Zero);try{Information(h,directory);return h;}catch{h.Dispose();throw;} }
    static SafeFileHandle ChildDirectory(SafeFileHandle parent,string name,bool exclusive,out bool collision) {
        // FILE_CREATE returns the directory handle atomically. There is no empty
        // mkdir/open gap for a previous pathname-based release to remove/reuse.
        IntPtr text=Marshal.StringToHGlobalUni(name),unicode=IntPtr.Zero;SafeFileHandle h=null;
        collision=false;
        try {
            var u=new UnicodeString{Length=checked((ushort)(name.Length*2)),MaximumLength=checked((ushort)((name.Length+1)*2)),Buffer=text};
            unicode=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString)));Marshal.StructureToPtr(u,unicode,false);
            var a=new ObjectAttributes{Length=Marshal.SizeOf(typeof(ObjectAttributes)),RootDirectory=parent.DangerousGetHandle(),ObjectName=unicode,Attributes=0x40};
            IoStatus io;
            int status=NtCreateFile(out h,exclusive?0x00130089u:0x00120089u,ref a,out io,IntPtr.Zero,0x10,1,exclusive?2u:3u,0x00200021,IntPtr.Zero,0);
            if(status==unchecked((int)0xC0000035)||status==unchecked((int)0xC0000043)){collision=true;if(h!=null)h.Dispose();return null;}
            Need(status>=0);Information(h,true);return h;
        } catch { if(h!=null)h.Dispose();throw; }
        finally { if(unicode!=IntPtr.Zero)Marshal.FreeHGlobal(unicode);Marshal.FreeHGlobal(text); }
    }
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetKernelObjectSecurity(SafeFileHandle h,uint requested,byte[] descriptor,uint length,out uint needed);
    static void PrivateHandle(SafeFileHandle h,bool immutable=false) {
        uint needed;GetKernelObjectSecurity(h,7,null,0,out needed);Need(needed>0&&needed<=65536);
        byte[] bytes=new byte[needed];Need(GetKernelObjectSecurity(h,7,bytes,needed,out needed));
        var acl=new RawSecurityDescriptor(bytes,0);string user=WindowsIdentity.GetCurrent().User.Value;
        Need(acl.Owner!=null&&Trusted(acl.Owner.Value)&&acl.DiscretionaryAcl!=null);
        foreach(GenericAce ace in acl.DiscretionaryAcl) {
            var known=ace as CommonAce;Need(known!=null&&!known.IsCallback);
            if(known.AceQualifier==AceQualifier.AccessAllowed&&(known.AccessMask&unchecked((int)0x500D0156))!=0)Need(immutable?(known.SecurityIdentifier.Value=="S-1-5-18"||known.SecurityIdentifier.Value=="S-1-5-32-544"):Trusted(known.SecurityIdentifier.Value));
        }
    }
    static bool Trusted(string sid) { return sid==WindowsIdentity.GetCurrent().User.Value||sid=="S-1-5-18"||sid=="S-1-5-32-544"; }
    static void Private(string p) {
        // Deny all write-capable allow ACEs except this operator, SYSTEM and Administrators.
        // Inherited ACEs are examined too; no ACL of an existing directory is modified.
        string user=WindowsIdentity.GetCurrent().User.Value;
        var acl=Directory.GetAccessControl(p,AccessControlSections.Access|AccessControlSections.Owner);
        string owner=((SecurityIdentifier)acl.GetOwner(typeof(SecurityIdentifier))).Value;
        Need(owner==user||owner=="S-1-5-18"||owner=="S-1-5-32-544");
        foreach(FileSystemAccessRule r in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
            string sid=r.IdentityReference.Value;
            if(r.AccessControlType==AccessControlType.Allow&&(r.FileSystemRights&(FileSystemRights.Write|FileSystemRights.Delete|FileSystemRights.DeleteSubdirectoriesAndFiles|FileSystemRights.ChangePermissions|FileSystemRights.TakeOwnership))!=0)
                Need(sid==user||sid=="S-1-5-18"||sid=="S-1-5-32-544");
        }
    }
    static void Delete(SafeFileHandle h) { var d=new Disposition{Delete=1};Need(SetFileInformationByHandle(h,4,ref d,1)); }
    static void UniqueFields(string json,JavaScriptSerializer parser) {
        var objects=new Stack<HashSet<string>>();
        for(int i=0;i<json.Length;i++) {
            if(json[i]=='{')objects.Push(new HashSet<string>(StringComparer.Ordinal));
            else if(json[i]=='}')objects.Pop();
            else if(json[i]=='\"') {
                int start=i++;while(i<json.Length&&json[i]!='\"'){if(json[i]=='\\')i++;i++;}
                Need(i<json.Length);int next=i+1;while(next<json.Length&&Char.IsWhiteSpace(json[next]))next++;
                if(next<json.Length&&json[next]==':')Need(objects.Count>0&&objects.Peek().Add((string)parser.DeserializeObject(json.Substring(start,i-start+1))));
            }
        }
    }
#if NEXUS_OPERATION_LOCK_TEST
    public static Action AfterAcquire;
    public static Action AfterValidation;
    public static Action<string> AfterProvisionalCreate;
#endif
    public static string Receive() {
        var text=new System.Text.StringBuilder();int ch;
        while((ch=Console.In.Read())!=-1) { if(ch==10)return text.ToString();Need(text.Length<65536);text.Append((char)ch); }
        Need(text.Length>0);return text.ToString();
    }
    static bool OwnerAlive(object value) {
        var owner=Fields(value,"pid","start");string pid=Number(owner["pid"]),start=Number(owner["start"]);int id;
        Need(Int32.TryParse(pid,out id)&&id>0&&start!="0");
        System.Diagnostics.Process process;
        try { process=System.Diagnostics.Process.GetProcessById(id); }
        catch(ArgumentException) { return false; }
        using(process) { return !process.HasExited&&process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()==start; }
    }
    static byte[] OwnerBytes(string token,object owner) {
        var o=Fields(owner,"pid","start");Number(o["pid"]);Number(o["start"]);
        return System.Text.Encoding.ASCII.GetBytes("{\"version\":1,\"token\":\""+token+"\",\"pid\":\""+o["pid"]+"\",\"start\":\""+o["start"]+"\"}\n");
    }
    static byte[] StaleOwner(SafeFileHandle handle,string token,JavaScriptSerializer parser) {
        byte[] bytes;
        using(var view=new FileStream(new SafeFileHandle(handle.DangerousGetHandle(),false),FileAccess.Read,4096,false)) {
            Need(view.Length>0&&view.Length<=1024);bytes=new byte[(int)view.Length];Need(view.Read(bytes,0,bytes.Length)==bytes.Length);
        }
        string json=System.Text.Encoding.ASCII.GetString(bytes);UniqueFields(json,parser);
        var record=Fields(parser.DeserializeObject(json),"version","token","pid","start");
        Need(record["version"] is int&&(int)record["version"]==1&&Text(record["token"])==token);
        var owner=new Dictionary<string,object>{{"pid",record["pid"]},{"start",record["start"]}};
        byte[] expected=OwnerBytes(token,owner);Need(bytes.Length==expected.Length);
        for(int i=0;i<bytes.Length;i++)Need(bytes[i]==expected[i]);
        Need(!OwnerAlive(owner));return bytes;
    }
    static void Remove(string lockPath,string ownerPath,SafeFileHandle lh,SafeFileHandle th,byte[] expected) {
        Need(Directory.GetFileSystemEntries(lockPath).Length==1);
        Information(lh,true);Information(th,false);PrivateHandle(lh);PrivateHandle(th);
        // Read through the held token, never a second mutable pathname.
        using(var view=new FileStream(th,FileAccess.Read,4096,false)) {
            view.Position=0;Need(view.Length==expected.Length);byte[] bytes=new byte[expected.Length];Need(view.Read(bytes,0,bytes.Length)==bytes.Length);
            for(int i=0;i<bytes.Length;i++)Need(bytes[i]==expected[i]);
            Delete(th);
        }
        Need(!File.Exists(ownerPath));Need(Directory.GetFileSystemEntries(lockPath).Length==0);
        Delete(lh);lh.Dispose();
        // Delete disposition may await a short-lived read/share-delete observer.
        // Waiting is not repair: success still requires verified absence.
        for(int attempt=0;attempt<20&&Directory.Exists(lockPath);attempt++)System.Threading.Thread.Sleep(50);
        Need(!Directory.Exists(lockPath));
    }
    static void BindCandidate(object value,Dictionary<string,SafeFileHandle> directories,List<SafeFileHandle> held) {
        var binding=Fields(value,"root","files","directories");string root=PathText(binding["root"]);
        Need(directories.ContainsKey(root));
        foreach(var directory in directories)if(directory.Key==root||directory.Key.StartsWith(root+"\\",StringComparison.OrdinalIgnoreCase))PrivateHandle(directory.Value,true);
        var files=binding["files"] as object[];Need(files!=null&&files.Length>=2&&files.Length<=258);
        var expected=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
        foreach(object entry in files) {
            var item=Fields(entry,"path","device","inode","size","hash");string name=Text(item["path"]);
            Need(name.Length<=240&&name.IndexOf('\\')<0&&name.IndexOf(':')<0);
            foreach(string part in name.Split('/'))Need(part!=""&&part!="."&&part!="..");
            string full=Path.Combine(root,name.Replace('/',Path.DirectorySeparatorChar));Need(expected.Add(full)&&directories.ContainsKey(Path.GetDirectoryName(full)));
            var handle=Open(full,false,false);held.Add(handle);PrivateHandle(handle,true);var info=Information(handle,false);
            Match(info,new Dictionary<string,object>{{"device",item["device"]},{"inode",item["inode"]}});
            ulong size=((ulong)info.SizeHigh<<32)|info.SizeLow;Need(size<=16777216&&size.ToString()==Number(item["size"]));total+=(long)size;Need(total<=67108864);
            // FileStream owns a non-owning view; the original no-write/delete-share
            // handle remains held throughout the external operation.
            using(var view=new SafeFileHandle(handle.DangerousGetHandle(),false))
            using(var stream=new FileStream(view,FileAccess.Read))
            using(var sha=System.Security.Cryptography.SHA256.Create()) {
                stream.Position=0;string digest=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();Need(digest==Text(item["hash"]));
            }
        }
        var pending=new Stack<string>();pending.Push(root);int count=0;
        while(pending.Count>0)foreach(string full in Directory.EnumerateFileSystemEntries(pending.Pop())) {
            Need(++count<=386);
            if(Directory.Exists(full)){Need(directories.ContainsKey(full));pending.Push(full);}
            else Need(expected.Remove(full));
        }
        Need(expected.Count==0);
    }
    public static string Run(string json) {
        Console.Out.NewLine="\n";
        var held=new List<SafeFileHandle>();bool provisional=false;
        SafeWaitHandle global=null,remote=null;SafeFileHandle ownerProcess=null;bool acknowledged=false,remoteClosed=false;
        try {
            var parser=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=12};
            UniqueFields(json,parser);
            var parsed=parser.DeserializeObject(json) as Dictionary<string,object>;Need(parsed!=null);
            object candidate=null;if(parsed.ContainsKey("candidate")){candidate=parsed["candidate"];parsed.Remove("candidate");}
            var r=Fields(parsed,"version","action","bindings","custody","directory","config","configIdentity","key","token","owner");
            Need(r["version"] is int&&(int)r["version"]==1);
            string action=Text(r["action"]);Need(action=="acquire"||action=="recover");
            if(action=="acquire")Need(OwnerAlive(r["owner"]));
            string custody=PathText(r["custody"]),directory=PathText(r["directory"]),key=Text(r["key"]),token=Text(r["token"]);
            Need(directory==Path.Combine(custody,".nexus-production-locks"));
            Need(System.Text.RegularExpressions.Regex.IsMatch(key,@"\A[a-f0-9]{64}\.lock\z")&&System.Text.RegularExpressions.Regex.IsMatch(token,@"\Aowner-[a-f0-9]{64}\.json\z"));
            // The named semaphore is a lifetime object, not a thread-owned mutex.
            // Duplicate a reference into the exact Node owner: helper death cannot
            // destroy the host-wide project identity while Node can still mutate.
            global=CreateSemaphoreW(IntPtr.Zero,0,1,"Global\\NexusOperation-v2-"+WindowsIdentity.GetCurrent().User.Value+"-"+key);
            int globalError=Marshal.GetLastWin32Error();Need(!global.IsInvalid);
            if(globalError==183)return "{\"status\":\"locked\"}";
            if(action=="acquire") {
                ownerProcess=OwnerHandle(r["owner"]);
                Need(DuplicateHandle(GetCurrentProcess(),global.DangerousGetHandle(),ownerProcess.DangerousGetHandle(),out remote,0,false,2));
                // This value belongs to the Node handle table, never this helper.
                remote.SetHandleAsInvalid();
            }
            var bindings=r["bindings"] as object[];Need(bindings!=null&&bindings.Length>0&&bindings.Length<256);
            var paths=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var directoryHandles=new Dictionary<string,SafeFileHandle>(StringComparer.OrdinalIgnoreCase);
            // Every path component is opened without write/delete sharing. All are held
            // until transaction completion, so pathname child opens cannot be redirected.
            foreach(object item in bindings) {
                var b=Fields(item,"path","device","inode");string p=PathText(b["path"]);
                Need(paths.Add(p));var h=Open(p,true,false);held.Add(h);directoryHandles.Add(p,h);
                Match(Information(h,true),new Dictionary<string,object>{{"device",b["device"]},{"inode",b["inode"]}});
            }
            string config=PathText(r["config"]);Need(config.StartsWith(custody+"\\",StringComparison.OrdinalIgnoreCase)&&paths.Contains(Path.GetDirectoryName(config)));
            Need(paths.Contains(custody));
            foreach(string p in new List<string>(paths)) { string parent=Path.GetDirectoryName(p);if(parent!=null)Need(paths.Contains(parent)); }
            var configHandle=Open(config,false,false);held.Add(configHandle);Match(Information(configHandle,false),r["configIdentity"]);PrivateHandle(configHandle);
            if(candidate!=null)BindCandidate(candidate,directoryHandles,held);
            Private(custody);
            foreach(string p in paths)if(p.StartsWith(custody+"\\",StringComparison.OrdinalIgnoreCase))Private(p);
            bool collision;
            SafeFileHandle root;
            if(directoryHandles.ContainsKey(directory))root=directoryHandles[directory];
            else {
                if(action=="recover") { Need(!Directory.Exists(directory)&&!File.Exists(directory));return "{\"status\":\"absent\"}"; }
                root=ChildDirectory(directoryHandles[custody],".nexus-production-locks",false,out collision);held.Add(root);
            }
            Private(directory);
#if NEXUS_OPERATION_LOCK_TEST
            if(AfterValidation!=null)AfterValidation();
#endif
            string lockPath=Path.Combine(directory,key),ownerPath=Path.Combine(lockPath,token);
            if(action=="acquire") {
                provisional=true;
                var lh=ChildDirectory(root,key,true,out collision);
                if(collision){provisional=false;return "{\"status\":\"locked\"}";}
                held.Add(lh);
                // The exact new directory is already pinned; even an old pathname
                // release cannot remove it during token setup. No retry gap exists.
#if NEXUS_OPERATION_LOCK_TEST
                if(AfterProvisionalCreate!=null)AfterProvisionalCreate(lockPath);
#endif
                Private(lockPath);
                Need(OwnerAlive(r["owner"]));
                byte[] ownerBytes=OwnerBytes(token,r["owner"]);
                using(var f=new FileStream(ownerPath,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
                    f.Write(ownerBytes,0,ownerBytes.Length);f.Flush(true);
                }
                var th=Open(ownerPath,false,true);held.Add(th);PrivateHandle(th);
#if NEXUS_OPERATION_LOCK_TEST
                if(AfterAcquire!=null)AfterAcquire();
#endif
                acknowledged=true;
                Console.Out.WriteLine("{\"status\":\"acquired\"}");Console.Out.Flush();
                Need(Receive()=="{\"action\":\"release\"}");
                Match(Information(configHandle,false),r["configIdentity"]);PrivateHandle(configHandle);
                foreach(string p in paths)if(p==custody||p.StartsWith(custody+"\\",StringComparison.OrdinalIgnoreCase))PrivateHandle(directoryHandles[p]);
                PrivateHandle(root);
                if(candidate!=null)BindCandidate(candidate,directoryHandles,held);
                Remove(lockPath,ownerPath,lh,th,ownerBytes);
                SafeWaitHandle closedRemote;
                Need(DuplicateHandle(ownerProcess.DangerousGetHandle(),remote.DangerousGetHandle(),GetCurrentProcess(),out closedRemote,0,false,3));
                closedRemote.Dispose();remoteClosed=true;
                return "{\"status\":\"released\"}";
            }
            if(!Directory.Exists(lockPath)) { Need(!File.Exists(lockPath));return "{\"status\":\"absent\"}"; }
            // DELETE access with read-only sharing is incompatible with an active
            // resident owner's exact directory handle. Never infer safety from PID/age.
            var lockHandle=Open(lockPath,true,true);held.Add(lockHandle);PrivateHandle(lockHandle);
            string[] entries=Directory.GetFileSystemEntries(lockPath);
            if(entries.Length==0) {
                // The host-wide object is held here and no Node owns a reference.
                // Exact DELETE handle, private ACL, empty enumeration and absence
                // verification are all mandatory; never recurse into unknown state.
                PrivateHandle(lockHandle);Need(Directory.GetFileSystemEntries(lockPath).Length==0);
                Delete(lockHandle);lockHandle.Dispose();Need(!Directory.Exists(lockPath)&&!File.Exists(lockPath));
                return "{\"status\":\"recovered\"}";
            }
            Need(entries.Length==1);
            ownerPath=entries[0];token=Path.GetFileName(ownerPath);
            Need(System.Text.RegularExpressions.Regex.IsMatch(token,@"\Aowner-[a-f0-9]{64}\.json\z"));
            var tokenHandle=Open(ownerPath,false,true);held.Add(tokenHandle);PrivateHandle(tokenHandle);
            byte[] stale=StaleOwner(tokenHandle,token,parser);
            Remove(lockPath,ownerPath,lockHandle,tokenHandle,stale);
            return "{\"status\":\"recovered\"}";
        } catch { if(provisional)return "{\"status\":\"cleanup\"}";throw; }
        finally {
            for(int i=held.Count-1;i>=0;i--)held[i].Dispose();
            if(remote!=null&&!acknowledged&&!remoteClosed) { SafeWaitHandle unused;if(DuplicateHandle(ownerProcess.DangerousGetHandle(),remote.DangerousGetHandle(),GetCurrentProcess(),out unused,0,false,3))unused.Dispose(); }
            if(global!=null)global.Dispose();if(ownerProcess!=null)ownerProcess.Dispose();if(remote!=null)remote.Dispose();
        }
    }
}
'@
    [Console]::Out.NewLine = "`n"
    $inputJson = [NexusOperationLock]::Receive()
    [Console]::Out.WriteLine([NexusOperationLock]::Run($inputJson))
} catch {
    [Console]::Out.WriteLine('{"status":"refused"}')
    exit 1
}
