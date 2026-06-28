export interface TransportState {
  isPlaying: boolean;
}

export const createDefaultTransport = (): TransportState => ({
  isPlaying: false
});
