let idCounter = 0;

export const createId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
};

export const resetIdCounterForTests = (): void => {
  idCounter = 0;
};
