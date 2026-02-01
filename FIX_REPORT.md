You reached the start of the range
Feb 1, 2026, 1:14 PM
scheduling build on Metal builder "builder-ejyuqd"
scheduling build on Metal builder "builder-ejyuqd"
[snapshot] received sha256:926074ec1d71a25bffd2c0ed16fbc367cf0b5078d923339caae540bb611f1801 md5:8085f9c9514b622a64b2e3d9dde68e98
receiving snapshot
12 MB
1.9s
found 'Dockerfile' at 'Dockerfile'
skipping 'Dockerfile' at 'backend/Dockerfile' as it is not rooted at a valid path (root_dir=, fileOpts={acceptChildOfRepoRoot:false})
skipping 'Dockerfile' at 'frontend/Dockerfile' as it is not rooted at a valid path (root_dir=, fileOpts={acceptChildOfRepoRoot:false})
skipping 'Dockerfile' at 'memory-server/Dockerfile' as it is not rooted at a valid path (root_dir=, fileOpts={acceptChildOfRepoRoot:false})
found 'nixpacks.toml' at 'nixpacks.toml'
found 'railway.json' at 'railway.json'
analyzing snapshot
12 MB
164ms
uploading snapshot
12 MB
417ms
fetched snapshot sha256:926074ec1d71a25bffd2c0ed16fbc367cf0b5078d923339caae540bb611f1801 (13 MB bytes)
fetching snapshot
12 MB
448ms
unpacking archive
26.3 MB
191ms

internal
load build definition from Dockerfile
0ms

internal
load metadata for docker.io/library/node:20-slim
1s

internal
load .dockerignore
0ms
JSONArgsRecommended: JSON arguments recommended for CMD to prevent unintended behavior related to OS signals (line 71)(https://docs.docker.com/go/dockerfile/rule/json-args-recommended/)
 details: JSON arguments recommended for ENTRYPOINT/CMD to prevent unintended behavior related to OS signals

frontend-builder
FROM docker.io/library/node:20-slim@sha256:6c51af7dc83f4708aaac35991306bca8f478351cfd2bda35750a62d7efcf05bb
18ms

internal
load build context
0ms

frontend-builder
WORKDIR /app/frontend cached
0ms

frontend-builder
RUN npm ci cached
0ms

frontend-builder
COPY frontend/package*.json ./ cached
0ms

frontend-builder
COPY frontend/ ./
426ms

backend-builder
RUN npm ci cached
136ms

backend-builder
WORKDIR /app/backend cached
0ms

backend-builder
COPY backend/package*.json ./ cached
0ms

backend-builder
COPY backend/ ./
415ms

frontend-builder
RUN npm run build
8s
> line-oa-frontend@2.0.0 build
> next build
Attention: Next.js now collects completely anonymous telemetry regarding usage.
This information is used to shape Next.js' roadmap and prioritize features.
You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
https://nextjs.org/telemetry
  ▲ Next.js 14.2.35
   Creating an optimized production build ...

backend-builder
RUN npm run build
7s
> line-oa-backend@2.0.0 build
> nest build
src/line-session/line-session.controller.ts:452:30 - error TS2339: Property 'state' does not exist on type '{ worker: { state: WorkerState; pinCode: string | undefined; hasKeys: boolean; hasChatMid: boolean; } | null; request: LoginRequest | null; cooldown: { inCooldown: boolean; remainingMs: number; recentErrors: number; nextRetryAt?: Date | undefined; }; }'.
452       hasActiveLogin: status.state !== 'idle',
                                 ~~~~~
src/line-session/line-session.controller.ts:453:22 - error TS2339: Property 'state' does not exist on type '{ worker: { state: WorkerState; pinCode: string | undefined; hasKeys: boolean; hasChatMid: boolean; } | null; request: LoginRequest | null; cooldown: { inCooldown: boolean; remainingMs: number; recentErrors: number; nextRetryAt?: Date | undefined; }; }'.
453       status: status.state,
                         ~~~~~
src/line-session/line-session.controller.ts:454:23 - error TS2339: Property 'pinCode' does not exist on type '{ worker: { state: WorkerState; pinCode: string | undefined; hasKeys: boolean; hasChatMid: boolean; } | null; request: LoginRequest | null; cooldown: { inCooldown: boolean; remainingMs: number; recentErrors: number; nextRetryAt?: Date | undefined; }; }'.
454       pinCode: status.pinCode,
                          ~~~~~~~
src/line-session/line-session.controller.ts:455:21 - error TS2339: Property 'error' does not exist on type '{ worker: { state: WorkerState; pinCode: string | undefined; hasKeys: boolean; hasChatMid: boolean; } | null; request: LoginRequest | null; cooldown: { inCooldown: boolean; remainingMs: number; recentErrors: number; nextRetryAt?: Date | undefined; }; }'.
[7m455[0m       error: status.error,

                        ~~~~~
Found 4 error(s).
Build Failed: build daemon returned an error < failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1 >
