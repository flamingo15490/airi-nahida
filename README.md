# airi-nahida

Customized AIRI desktop companion build for local Nahida-style interaction, external memory integration, and controlled proactive support.

## Overview

This repository is a personal AIRI-based custom development branch focused on building a more stable and daily-usable local desktop companion.

Current direction:
- Keep AIRI as the main framework
- Preserve the existing external service architecture
- Improve source-level stability before large-scale expansion
- Build a cleaner foundation for a Nahida-style personalized companion

## Current Focus

This custom branch currently focuses on:
- Source-level stability fixes
- Vision runtime stabilization
- Context bridge sanitization
- External memory integration with `D:\AIRI-Memory`
- Nahida persona enhancement
- Controlled proactive companion coordination with external sidecar

## Design Principles

- Local-first customization
- External systems remain external in early stages
- Minimal structural fixes before major expansion
- Stable daily use is more important than doing everything at once
- Keep the codebase maintainable and easy to extend

## What This Repository Is

This repository is:
- A customized AIRI source build
- A personal development branch for local daily use
- A foundation for a Nahida-oriented desktop companion workflow

This repository is not:
- A full rewrite of AIRI
- A complete built-in memory engine
- A full built-in sidecar system
- A one-shot final form of the project

## Current Implemented Areas

Implemented and already integrated into the source tree:
- Context bridge sanitization for non-cloneable objects
- App-level persistent vision runner
- Legacy local data and file-origin storage restoration support
- Desktop-only external integration settings layer
- External memory read / supplement / controlled write-back flow
- Nahida persona layer with adjustable modes
- Proactive companion governance layer with event history and cooldown control

See also:
- [已实现功能.md](./已实现功能.md)
- [00-项目总目标.md](./00-项目总目标.md)
- [04-最终愿景与阶段路线图.md](./04-最终愿景与阶段路线图.md)

## Local Startup

This repository is mainly used as a local source build.

Typical workflow:
- Run the AIRI source desktop app from this repo
- Reuse existing local AIRI data where appropriate
- Keep memory, sidecar, TTS, and image-generation services external unless a later stage explicitly changes that

## Status

This project is currently in an iterative custom-development phase.

The short-term goal is not to turn everything into built-in AIRI modules immediately, but to make the current local companion stack:
- more stable
- easier to verify
- easier to maintain
- easier to extend in later stages

## Notes

- Upstream AIRI remains the original foundation of this work.
- This repository intentionally follows a conservative, staged integration path.
- Large architectural rewrites are not the current priority.
