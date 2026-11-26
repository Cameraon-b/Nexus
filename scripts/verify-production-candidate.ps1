# Standalone verifier: install outside the candidate and pin this exact file's SHA256.
param([Parameter(Mandatory=$true)][string]$Candidate)
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'Unknown candidate verifier arguments.' }
$held = [Collections.Generic.List[IDisposable]]::new()
try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class NexusCandidateInfo {
 [StructLayout(LayoutKind.Sequential)] struct Time {public uint Low,High;}
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint Attributes;public Time C,A,W;public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 public static void Check(SafeFileHandle h) {Info i;if(!GetFileInformationByHandle(h,out i)||(i.Attributes&0x410)!=0||i.Links!=1)throw new InvalidOperationException();}
}
'@
    $root = [IO.Path]::GetFullPath($Candidate)
    $id = [IO.Path]::GetFileName($root)
    if ($id -cnotmatch '\A[a-f0-9]{64}\z') { throw 'id' }
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $admins = @('S-1-5-18','S-1-5-32-544')
    $items = @((Get-Item -LiteralPath $root -Force)) + @(Get-ChildItem -LiteralPath $root -Force -Recurse)
    if ($items.Count -gt 386) { throw 'count' }
    $streams = @{}
    $total = 0
    foreach ($item in $items) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
        $acl = Get-Acl -LiteralPath $item.FullName
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cnotin (@($user) + $admins)) { throw 'owner' }
        $raw = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0)
        if ($null -eq $raw.DiscretionaryAcl) { throw 'acl' }
        foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            if ($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band 0x500D0156) -ne 0 -and $rule.IdentityReference.Value -cnotin $admins) { throw 'writable' }
        }
        if (-not $item.PSIsContainer) {
            $stream = [IO.File]::Open($item.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
            $held.Add($stream)
            [NexusCandidateInfo]::Check($stream.SafeFileHandle)
            if ($stream.Length -gt 16777216) { throw 'size' }
            $total += $stream.Length
            if ($total -gt 67108864) { throw 'total' }
            $name = $item.FullName.Substring($root.Length+1).Replace('\','/')
            if ($streams.ContainsKey($name)) { throw 'duplicate' }
            $streams.Add($name,$stream)
        }
    }
    function Bytes([string]$Name,[int]$Cap) {
        $s = $streams[$Name]
        if ($null -eq $s -or $s.Length -gt $Cap) { throw 'member' }
        $s.Position = 0
        $bytes = [byte[]]::new([int]$s.Length)
        $n = 0
        while ($n -lt $bytes.Length) { $count=$s.Read($bytes,$n,$bytes.Length-$n); if ($count -le 0) { throw 'short' }; $n += $count }
        return ,$bytes
    }
    function Digest([byte[]]$Bytes) {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    }
    $utf8 = [Text.UTF8Encoding]::new($false,$true)
    $marker = $utf8.GetString((Bytes 'CANDIDATE_ID' 65))
    if ($marker -cne $id -and $marker -cne ($id+"`n")) { throw 'marker' }
    $manifest = Bytes 'MANIFEST.sha256' 65536
    if ((Digest $manifest) -cne $id) { throw 'manifest' }
    $text = $utf8.GetString($manifest)
    if (-not $text.EndsWith("`n") -or $text.Contains("`r")) { throw 'canonical' }
    $expected = @{}
    $previous = $null
    foreach ($line in $text.Substring(0,$text.Length-1).Split("`n")) {
        if ($line -cnotmatch '\A([a-f0-9]{64}) \*([^\x00-\x1f\x7f]+)\z') { throw 'line' }
        $digest = $Matches[1]; $name = $Matches[2]
        if ($null -ne $previous -and [StringComparer]::Ordinal.Compare($previous,$name) -ge 0) { throw 'order' }
        $previous = $name
        if ($name.Length -gt 240 -or $name.Contains('\') -or $name.Contains(':') -or $name.Split('/').Count -gt 16 -or $name -cin @('CANDIDATE_ID','MANIFEST.sha256') -or $expected.ContainsKey($name)) { throw 'path' }
        foreach ($part in $name.Split('/')) { if ($part -cin @('','.','..')) { throw 'part' } }
        $expected.Add($name,$true)
        if ($expected.Count -gt 256 -or (Digest (Bytes $name 16777216)) -cne $digest) { throw 'digest' }
    }
    if ($streams.Count -ne $expected.Count+2) { throw 'inventory' }
    foreach ($name in $streams.Keys) { if ($name -cnotin @('CANDIDATE_ID','MANIFEST.sha256') -and -not $expected.ContainsKey($name)) { throw 'extra' } }
    foreach ($item in $items) {
        if ($item.PSIsContainer -and $item.FullName -cne $root) {
            $prefix = $item.FullName.Substring($root.Length+1).Replace('\','/')+'/'
            if (-not @($expected.Keys | Where-Object { $_.StartsWith($prefix,[StringComparison]::Ordinal) }).Count) { throw 'directory' }
        }
    }
} catch { [Console]::Error.WriteLine('Candidate verification refused.'); exit 1 }
finally { foreach ($stream in $held) { $stream.Dispose() } }
