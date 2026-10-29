export type CollaborativeShot = { position: number; title: string; description: string; contributor: string | null };

export function buildCollaborativeScript(script: string, shots: CollaborativeShot[]): string {
  const contributions = [...shots]
    .sort((a, b) => a.position - b.position)
    .map(shot => `Shot ${shot.position}: ${shot.title}\nContributor: ${shot.contributor || "Film owner"}\nDescription: ${shot.description}`)
    .join("\n\n");
  return contributions
    ? `${script.trim()}\n\nCOLLABORATOR SHOT CONTRIBUTIONS (preserve their order and connect them into one coherent film):\n${contributions}`
    : script.trim();
}
