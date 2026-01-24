// Your deployed program ID on devnet
export const PROGRAM_ID_STRING = '7dChiG6VDtneaVXxd2gdtg6MxsPXTvYUnEPEgP4sFKts';

// Network configuration - DEVNET
export const NETWORK = 'devnet' as const;
export const RPC_ENDPOINT = 'https://api.devnet.solana.com';

// Commitment level
export const COMMITMENT = 'confirmed' as const;

// UI Constants
export const MIN_SPLIT_AMOUNT = 0.001; // 0.001 SOL minimum
export const DEFAULT_PERCENTAGE_1 = 60;
export const DEFAULT_PERCENTAGE_2 = 40;