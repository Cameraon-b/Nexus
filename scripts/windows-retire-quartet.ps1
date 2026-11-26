# Windows-only exact-handle retirement. No pathname deletion, even on failure.
$ErrorActionPreference = 'Stop'
try {
    # Node checks identity/single-link status; Windows also checks all reparse attributes.
    $self = Get-Item -LiteralPath $PSCommandPath -Force
    if ($self.PSIsContainer -or ($self.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'refused' }
    Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class NexusHandleRetirement {
    [StructLayout(LayoutKind.Sequential)] struct FileTime { public uint Low, High; }
    [StructLayout(LayoutKind.Sequential)] struct Info {
        public uint Attributes; public FileTime Creation, Access, Write;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Sequential)] struct Disposition { public byte Delete; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h, out Info info);
    [DllImport("kernel32.dll")] static extern uint GetFileType(SafeFileHandle h);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h, int kind, ref Disposition info, uint size);
    // These fault controls do not exist in the normally compiled helper.
#if NEXUS_RETIREMENT_TEST
    public static int FailDispositionAt=-1, FailRollbackAt=-1, RollbackAttempts=0;
#endif
    static bool SetDisposition(SafeFileHandle handle, int index, bool delete) {
#if NEXUS_RETIREMENT_TEST
        if (!delete) RollbackAttempts++;
        if ((delete && index==FailDispositionAt) || (!delete && index==FailRollbackAt)) return false;
#endif
        var disposition=new Disposition { Delete=(byte)(delete ? 1 : 0) };
        return SetFileInformationByHandle(handle,4,ref disposition,1);
    }
    static ulong Identity(object value, int bits) {
        string text=value as string; ulong result;
        Require(text!=null && text.Length<=20 && System.Text.RegularExpressions.Regex.IsMatch(text,@"\A(?:0|[1-9][0-9]*)\z"));
        Require(UInt64.TryParse(text,System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out result));
        Require(bits==64 || result<=UInt32.MaxValue); return result;
    }
    static void CheckIdentity(Info info, ulong device, ulong inode) {
        Require((ulong)info.Volume==device && (((ulong)info.IndexHigh<<32)|info.IndexLow)==inode);
    }
    static void Require(bool value) { if (!value) throw new InvalidOperationException(); }
    static Dictionary<string,object> Fields(object value, params string[] names) {
        var d=value as Dictionary<string,object>; Require(d!=null && d.Count==names.Length);
        foreach(var name in names) Require(d.ContainsKey(name)); return d;
    }
    static void RejectDuplicateFields(string json, JavaScriptSerializer parser) {
        var objects=new Stack<HashSet<string>>();
        for(int i=0;i<json.Length;i++) {
            if(json[i]=='{') objects.Push(new HashSet<string>(StringComparer.Ordinal));
            else if(json[i]=='}') objects.Pop();
            else if(json[i]=='\"') {
                int start=i++; while(i<json.Length && json[i]!='\"') { if(json[i]=='\\') i++; i++; }
                Require(i<json.Length); int next=i+1; while(next<json.Length && Char.IsWhiteSpace(json[next])) next++;
                if(next<json.Length && json[next]==':') Require(objects.Count>0 && objects.Peek().Add((string)parser.DeserializeObject(json.Substring(start,i-start+1))));
            }
        }
    }
    public static bool Run(string json) {
        var streams=new List<FileStream>();
        var handles=new List<SafeFileHandle>();
        try {
            var parser=new JavaScriptSerializer(); parser.MaxJsonLength=32768; parser.RecursionLimit=8;
            var request=Fields(parser.DeserializeObject(json),"version","directory","members"); RejectDuplicateFields(json,parser);
            Require(request["version"] is int && (int)request["version"]==1);
            var directory=request["directory"] as string;
            Require(directory!=null && System.Text.RegularExpressions.Regex.IsMatch(directory,@"^[A-Za-z]:[\\/]") && directory.IndexOf('\0')<0);
            var members=request["members"] as object[]; Require(members!=null && members.Length==4);
            string[] suffixes={".tar.age",".tar.age.sha256",".metadata.json",".signature.json"};
            long[] caps={537919488,256,16384,4096};
            var lengths=new long[4]; var digests=new string[4]; var devices=new ulong[4]; var inodes=new ulong[4]; string stem=null;
            // Validate the entire closed request before opening anything.
            for(int i=0;i<4;i++) {
                var member=Fields(members[i],"name","length","sha256","device","inode");
                devices[i]=Identity(member["device"],32); inodes[i]=Identity(member["inode"],64);
                string name=member["name"] as string, digest=member["sha256"] as string;
                Require(name!=null && System.Text.RegularExpressions.Regex.IsMatch(name,@"\Anexus-backup-[0-9]{8}T[0-9]{6}Z"+System.Text.RegularExpressions.Regex.Escape(suffixes[i])+@"\z"));
                string current=name.Substring(0,name.Length-suffixes[i].Length); if(i==0) stem=current; Require(stem==current);
                Require(member["length"] is int || member["length"] is long);
                lengths[i]=Convert.ToInt64(member["length"]); Require(lengths[i]>=0 && lengths[i]<=caps[i] && (i!=0 || lengths[i]>0));
                Require(digest!=null && System.Text.RegularExpressions.Regex.IsMatch(digest,@"\A[a-f0-9]{64}\z")); digests[i]=digest;
            }
            // GENERIC_READ | DELETE; FILE_SHARE_READ only; OPEN_EXISTING;
            // OPEN_REPARSE_POINT | SEQUENTIAL_SCAN. No write/delete/rename sharing.
            for(int i=0;i<4;i++) {
                var member=(Dictionary<string,object>)members[i];
                var h=CreateFileW(Path.Combine(directory,(string)member["name"]),0x80010000,1,IntPtr.Zero,3,0x08200000,IntPtr.Zero);
                handles.Add(h); Require(!h.IsInvalid);
            }
            for(int i=0;i<4;i++) {
                Info info=new Info(); Require(GetFileType(handles[i])==1 && GetFileInformationByHandle(handles[i],out info));
                CheckIdentity(info,devices[i],inodes[i]);
                Require((info.Attributes & (0x10|0x40|0x400))==0 && info.Links==1);
                Require((((long)info.SizeHigh<<32)|info.SizeLow)==lengths[i]);
                var stream=new FileStream(handles[i],FileAccess.Read); streams.Add(stream);
                byte[] actual; using(var sha=SHA256.Create()) actual=sha.ComputeHash(stream);
                string text=BitConverter.ToString(actual).Replace("-","").ToLowerInvariant();
                int difference=0; for(int j=0;j<64;j++) difference|=text[j]^digests[i][j]; Require(difference==0);
                Require(stream.Position==lengths[i]);
            }
            // Recheck all held objects after hashing and before any disposition.
            for(int i=0;i<4;i++) {
                Info info=new Info(); Require(GetFileType(handles[i])==1 && GetFileInformationByHandle(handles[i],out info));
                CheckIdentity(info,devices[i],inodes[i]);
                Require((info.Attributes & (0x10|0x40|0x400))==0 && info.Links==1 && (((long)info.SizeHigh<<32)|info.SizeLow)==lengths[i]);
            }
            // All four exact held objects validated before the first disposition.
            var marked=new List<int>();
            for(int i=0;i<handles.Count;i++) {
                bool set=false; try { set=SetDisposition(handles[i],i,true); } catch { }
                if (!set) {
                    // Best effort only: try every prior handle even if a rollback fails.
                    foreach(int earlier in marked) { try { SetDisposition(handles[earlier],earlier,false); } catch { } }
                    return false;
                }
                marked.Add(i);
            }
            return true;
        } catch { return false; }
        finally { foreach(var stream in streams) stream.Dispose(); foreach(var handle in handles) handle.Dispose(); }
    }
}
'@ | Out-Null
    # Bounded stdin, no arguments/configuration expansion or diagnostic disclosure.
    $buffer = New-Object char[] 32769
    $count = 0
    while ($count -lt $buffer.Length) {
        $n = [Console]::In.Read($buffer, $count, $buffer.Length - $count)
        if ($n -eq 0) { break }
        $count += $n
    }
    if ($count -gt 32768) { throw 'refused' }
    if (-not [NexusHandleRetirement]::Run([string]::new($buffer, 0, $count))) { throw 'refused' }
    [Console]::Out.WriteLine('NEXUS_RETENTION_OK')
    exit 0
} catch {
    [Console]::Out.WriteLine('NEXUS_RETENTION_REFUSED')
    exit 1
}
