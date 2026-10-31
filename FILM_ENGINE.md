# Film engine

The upstream CineCrew implementation remains under `src/`. FilmDSL (`src/schemas/blueprint.py`) represents a structured shot blueprint with linked assets. Its generative pipeline requires configured models and has input truncation limits; it does not establish a verified 60–120 minute film workflow.

`services/film-engine` stores offline checkpoints and imports valid CineCrew SceneBlueprint documents. Its production-plan endpoint calls the real CineCrew `ProductionOperatorAgent.build_from_blueprint` using an imported FilmDSL and asset library, then persists the resulting job specifications without submitting them. The separate checkpoint stages remain deterministic planning placeholders, not generated scripts or media. Real agent execution, continuity verification, provider job submission, storage and publication remain unimplemented.

The engine is protected by a service token; a trusted gateway must authorize every user and project before forwarding requests. It is not safe to expose directly to untrusted clients.
