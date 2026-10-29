# Film engine

The upstream CineCrew implementation is preserved under `src/`. Its FilmDSL (`src/schemas/blueprint.py`) represents a structured shot blueprint with linked assets. Its production pipeline requires configured models and has input truncation limits; it does not establish a verified 60–120 minute film workflow. Refer to the upstream README and AGENTS.md for actual operation.

`services/film-engine` is an experimental local service with mock stage checkpoints. These records do not constitute generated scripts, videos or verified production. It must not be confused with the original CineCrew pipeline. The service can validate and store imported CineCrew SceneBlueprint documents, but does not run CineCrew agents. Versioned continuity, resumable production jobs, and real model execution remain work for a later phase.
