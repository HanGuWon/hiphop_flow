import type { SampleTriggerer } from "./AudioEngine";

interface TriggerableSample {
  start(time?: number): unknown;
  volume: {
    value: number;
  };
}

const velocityToDecibels = (velocity: number): number => {
  if (velocity <= 0) {
    return -60;
  }

  return 20 * Math.log10(velocity);
};

export class SamplePlayer implements SampleTriggerer {
  private tone: typeof import("tone") | undefined;
  private readonly players = new Map<string, TriggerableSample>();

  async loadSample(channelId: string, url: string): Promise<void> {
    this.tone = this.tone ?? (await import("tone"));
    const player = new this.tone.Player({ url }).toDestination();

    await this.tone.loaded();
    this.players.set(channelId, player);
  }

  hasSample(channelId: string): boolean {
    return this.players.has(channelId);
  }

  trigger(channelId: string, time: number, velocity: number): void {
    const player = this.players.get(channelId);

    if (!player) {
      return;
    }

    player.volume.value = velocityToDecibels(velocity);
    player.start(time);
  }
}
