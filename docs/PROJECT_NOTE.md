# Project Note

## Stack Decision

The MVP uses Vite, React, TypeScript, and browser Web Audio APIs.

This is the practical starting stack because the first milestone needs a professional interactive UI, safe local upload handling, and clear seams for heavier audio engines without pretending that AI processing is already complete. React gives the app a maintainable screen/component model, TypeScript protects future engine contracts, and Vite keeps iteration fast.

The current prototype stays browser-local. User uploads are inspected in memory by the browser for basic metadata and waveform summaries. No upload, downloader, streaming-source integration, public catalog, or sharing hub is included.

## Product Boundary

MashLab AI / CyphaBlend AI is a neutral private audio-processing tool. The user supplies audio and is responsible for having the rights needed for any use, publication, or distribution.

Required notice:

> Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Phase 0 Result

This project starts as a frontend MVP shell with docs and typed adapter plans. The product can accept two local files and display safe metadata. The audio intelligence engines are intentionally marked as pending.
