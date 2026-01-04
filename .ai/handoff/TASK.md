
scheduling build on Metal builder "builder-ejyuqd"
[snapshot] received sha256:f69243578d0ea02a4a4f11e18edc8fe3b4089908262345a9910cfe19715d8c0d md5:e748206e0dd7543eaabf5c11e6ca6226
receiving snapshot
452.1 KB
2.4s
found 'Dockerfile' at 'Dockerfile'
skipping 'Dockerfile' at 'backend/Dockerfile' as it is not rooted at a valid path (root_dir=, fileOpts={acceptChildOfRepoRoot:false})
skipping 'Dockerfile' at 'frontend/Dockerfile' as it is not rooted at a valid path (root_dir=, fileOpts={acceptChildOfRepoRoot:false})
skipping 'Dockerfile' at 'memory-server/Dockerfile' as it is not rooted at a valid path (root_dir=, fileOpts={acceptChildOfRepoRoot:false})
found 'nixpacks.toml' at 'nixpacks.toml'
found 'railway.json' at 'railway.json'
analyzing snapshot
452.1 KB
20ms
uploading snapshot
452.1 KB
fetched snapshot sha256:f69243578d0ea02a4a4f11e18edc8fe3b4089908262345a9910cfe19715d8c0d (463 kB bytes)
fetching snapshot
452.1 KB
87ms
unpacking archive
2.2 MB
24ms

internal
load build definition from Dockerfile
0ms

internal
load metadata for docker.io/library/node:20-slim
11s
Build Failed: build daemon returned an error < failed to solve: node:20-slim: failed to resolve source metadata for docker.io/library/node:20-slim: failed to authorize: failed to fetch oauth token: Get "https://auth.docker.io/token?scope=repository%3Alibrary%2Fnode%3Apull&service=registry.docker.io": net/http: TLS handshake timeout >