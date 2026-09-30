/** The message a wallet signs to see its own rewards. It is valid for the UTC day it names and the day after. */
export const rewardsMessage = (address: string, day: string) => `Show my Silverchat rewards\n\n${address.toLowerCase()}\n${day}`;

export const today = () => new Date().toISOString().slice(0, 10);
