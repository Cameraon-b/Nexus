# Public closed-protocol candidate custody verifier/installer. JSON only on stdin.
$ErrorActionPreference = 'Stop'
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if (($request.PSObject.Properties.Name | Sort-Object) -join ',' -cne 'action,root') { throw 'schema' }
    if ($request.action -cnotin @('verify','install')) { throw 'action' }
    $root = [IO.Path]::GetFullPath([string]$request.root)
    if (-not [IO.Path]::IsPathRooted([string]$request.root) -or -not [IO.Directory]::Exists($root)) { throw 'root' }
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $admins = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $items = @((Get-Item -LiteralPath $root -Force)) + @(Get-ChildItem -LiteralPath $root -Force -Recurse)
    if ($items.Count -gt 386) { throw 'bound' }
    foreach ($item in $items) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'reparse' }
    }
    if ($request.action -ceq 'install') {
        foreach ($item in ($items | Sort-Object { $_.FullName.Length } -Descending)) {
            if ($item.PSIsContainer) { $acl = [Security.AccessControl.DirectorySecurity]::new() }
            else { $acl = [Security.AccessControl.FileSecurity]::new() }
            $acl.SetAccessRuleProtection($true,$false)
            foreach ($sid in @($system,$admins)) {
                $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))
            }
            $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($user,'ReadAndExecute','Allow'))
            if ($item.PSIsContainer) { [IO.Directory]::SetAccessControl($item.FullName,$acl) }
            else { [IO.File]::SetAccessControl($item.FullName,$acl) }
        }
    }
    $writes = [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor [Security.AccessControl.FileSystemRights]::TakeOwnership
    foreach ($item in $items) {
        $acl = Get-Acl -LiteralPath $item.FullName
        $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
        if ($owner -cnotin @($user.Value,$system.Value,$admins.Value)) { throw 'owner' }
        $raw = [Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0)
        if ($null -eq $raw.DiscretionaryAcl) { throw 'acl' }
        foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            if ($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band 0x500D0156) -ne 0 -and $rule.IdentityReference.Value -cnotin @($system.Value,$admins.Value)) { throw 'writable' }
        }
    }
    [Console]::Out.Write('verified')
} catch { [Console]::Error.Write('Candidate custody refused'); exit 1 }
