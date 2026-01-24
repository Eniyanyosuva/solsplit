import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { PROGRAM_ID_STRING } from './config';

// Instruction discriminators from your Anchor program IDL
const DISCRIMINATORS = {
  INITIALIZE_SPLIT: Buffer.from([53, 17, 92, 9, 84, 151, 173, 78]),
  EXECUTE_SPLIT: Buffer.from([6, 45, 171, 40, 49, 129, 23, 89]),
};

// Helper to convert u64 to little-endian bytes
function u64ToLeBytes(num: number): Buffer {
  const bn = new BN(num);
  return bn.toArrayLike(Buffer, 'le', 8);
}

export function createInitializeSplitInstruction(
  sender: PublicKey,
  recipient1: PublicKey,
  recipient2: PublicKey,
  recipient1Percentage: number,
  recipient2Percentage: number,
  nonce: number
): TransactionInstruction {
  const programId = new PublicKey(PROGRAM_ID_STRING);
  
  // Derive PDA - must match the seeds in your Rust program exactly
  const nonceBuffer = u64ToLeBytes(nonce);
  
  const [splitConfigPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('split_config'),
      sender.toBuffer(),
      nonceBuffer,
    ],
    programId
  );

  // Serialize instruction data according to Anchor's format:
  // discriminator (8 bytes) + recipient1_percentage (u8) + recipient2_percentage (u8) + nonce (u64 LE)
  const data = Buffer.concat([
    DISCRIMINATORS.INITIALIZE_SPLIT,
    Buffer.from([recipient1Percentage]),
    Buffer.from([recipient2Percentage]),
    nonceBuffer,
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: splitConfigPDA, isSigner: false, isWritable: true },
      { pubkey: sender, isSigner: true, isWritable: true },
      { pubkey: recipient1, isSigner: false, isWritable: false },
      { pubkey: recipient2, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

export function createExecuteSplitInstruction(
  sender: PublicKey,
  recipient1: PublicKey,
  recipient2: PublicKey,
  amount: BN,
  nonce: number
): TransactionInstruction {
  const programId = new PublicKey(PROGRAM_ID_STRING);
  
  // Derive PDA - must match the seeds in your Rust program exactly
  const nonceBuffer = u64ToLeBytes(nonce);
  
  const [splitConfigPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('split_config'),
      sender.toBuffer(),
      nonceBuffer,
    ],
    programId
  );

  // Serialize instruction data according to Anchor's format:
  // discriminator (8 bytes) + amount (u64 LE)
  const data = Buffer.concat([
    DISCRIMINATORS.EXECUTE_SPLIT,
    amount.toArrayLike(Buffer, 'le', 8),
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: splitConfigPDA, isSigner: false, isWritable: true },
      { pubkey: sender, isSigner: true, isWritable: true },
      { pubkey: recipient1, isSigner: false, isWritable: true },
      { pubkey: recipient2, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}