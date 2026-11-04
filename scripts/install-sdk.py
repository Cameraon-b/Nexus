"""Install the pinned Windows SDK inside this repository, never system-wide."""
import pathlib, urllib.request, json, hashlib, zipfile, os
root=pathlib.Path(__file__).resolve().parent.parent
target=root/'.tools/dotnet'; archive=root/'.cache/dotnet-sdk.zip'
version=json.loads((root/'global.json').read_text())['sdk']['version']
if os.name!='nt':
    raise SystemExit('This helper installs the Windows SDK only. Install the pinned SDK with your platform tooling.')
metadata=json.load(urllib.request.urlopen('https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json'))
sdks=[sdk for release in metadata['releases'] for sdk in release.get('sdks',[release['sdk']])]
sdk=next(s for s in sdks if s['version']==version)
item=next(f for f in sdk['files'] if f['rid']=='win-x64' and f['name'].endswith('.zip'))
archive.parent.mkdir(exist_ok=True,parents=True)
valid=False
if archive.exists():
    with archive.open('rb') as f:valid=hashlib.file_digest(f,'sha512').hexdigest().lower()==item['hash'].lower()
if not valid:
    print('Downloading pinned SDK',version,flush=True)
    urllib.request.urlretrieve(item['url'],archive)
with archive.open('rb') as f:digest=hashlib.file_digest(f,'sha512').hexdigest()
if digest.lower()!=item['hash'].lower():raise SystemExit('SDK checksum mismatch; installation aborted.')
target.mkdir(exist_ok=True,parents=True)
with zipfile.ZipFile(archive) as z:z.extractall(target)
print('Verified and extracted .NET SDK',version,'to',target)
