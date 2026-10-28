export type Clock = {
  nowSeconds: () => number;
  now: () => Date;
};

export const systemClock: Clock = {
  nowSeconds: () => Math.floor(Date.now() / 1000),
  now: () => new Date(),
};
