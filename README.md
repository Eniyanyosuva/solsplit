# SolSplit

A minimal, secure Solana smart contract for splitting SOL payments between two recipients based on predefined percentage allocations.

## 🚀 Features

- ✅ Secure SOL payment splitting
- ✅ Program Derived Account (PDA) for state management
- ✅ Percentage validation (must total exactly 100%)
- ✅ One-time execution protection (prevents replay attacks)
- ✅ Clean and minimal Anchor-based architecture

## 🧠 How It Works

1. A sender initializes a split configuration by specifying:
   - Two recipient wallet addresses
   - Percentage allocation for each recipient
2. The configuration is stored in a PDA-derived state account
3. The sender executes the split by sending SOL
4. SOL is transferred atomically to both recipients according to the configured percentages
5. The split is permanently marked as executed and cannot be reused

## 📐 Architecture

### Program Derived Account (PDA)

The split configuration is stored in a PDA derived using deterministic seeds:

```rust
seeds = [b"split_config", sender.key().as_ref()]
```

### State Account Structure

```rust
pub struct SplitConfig {
    pub sender: Pubkey,              // 32 bytes
    pub recipient1: Pubkey,          // 32 bytes
    pub recipient2: Pubkey,          // 32 bytes
    pub recipient1_percentage: u8,   // 1 byte
    pub recipient2_percentage: u8,   // 1 byte
    pub executed: bool,              // 1 byte
    pub bump: u8,                    // 1 byte
}
```

## 📋 Prerequisites

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.30.1+
- Node.js 18+
- Yarn

## 🛠️ Installation

### 1. Clone and Setup

```bash
# Create project directory
mkdir solsplit && cd solsplit

# Copy all project files (see artifacts above)

# Install dependencies
yarn install
```

### 2. Build the Program

```bash
# Build
anchor build

# Get the program ID
anchor keys list

# Update the program ID in:
# - Anchor.toml (under [programs.localnet])
# - programs/solsplit/src/lib.rs (declare_id! macro)

# Rebuild after updating program ID
anchor build
```

### 3. Run Tests

```bash
# Start local validator (in a separate terminal)
solana-test-validator

# Run tests
anchor test --skip-local-validator
```

## 💻 Usage

### Initialize Split Configuration

```typescript
const [splitConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("split_config"), sender.publicKey.toBuffer()],
  program.programId
);

await program.methods
  .initializeSplit(60, 40) // 60% to recipient1, 40% to recipient2
  .accounts({
    splitConfig: splitConfigPDA,
    sender: sender.publicKey,
    recipient1: recipient1.publicKey,
    recipient2: recipient2.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();
```

### Execute Split

```typescript
const amount = new anchor.BN(1_000_000_000); // 1 SOL in lamports

await program.methods
  .executeSplit(amount)
  .accounts({
    splitConfig: splitConfigPDA,
    sender: sender.publicKey,
    recipient1: recipient1.publicKey,
    recipient2: recipient2.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();
```

## 🔒 Security Features

### Validation Checks

- **Percentage Validation**: Sum must equal exactly 100%
- **Non-zero Percentages**: Both percentages must be greater than 0
- **Sender Authorization**: Only the original sender can execute the split
- **Recipient Validation**: Recipients must match the initialized configuration
- **Amount Validation**: Transfer amount must be greater than 0

### Replay Protection

The `executed` flag ensures each split configuration can only be used once:

```rust
require!(!split_config.executed, SplitError::AlreadyExecuted);
// ... perform transfers ...
split_config.executed = true;
```

### Safe Arithmetic

Uses checked arithmetic operations to prevent overflow:

```rust
let amount1 = (amount as u128)
    .checked_mul(split_config.recipient1_percentage as u128)
    .unwrap()
    .checked_div(100)
    .unwrap() as u64;
```

## 🧪 Test Suite

The project includes comprehensive tests:

1. ✅ **Initialize split configuration** - Tests 60/40 split setup
2. ✅ **Execute split successfully** - Verifies correct SOL distribution
3. ✅ **Invalid percentages** - Ensures percentages must sum to 100%
4. ✅ **Replay attack prevention** - Confirms one-time execution

Run tests with:

```bash
anchor test
```

## 📁 Project Structure

```
solsplit/
├── Anchor.toml                 # Anchor configuration
├── Cargo.toml                  # Rust workspace config
├── package.json                # Node.js dependencies
├── tsconfig.json               # TypeScript config
├── programs/
│   └── solsplit/
│       ├── Cargo.toml          # Program dependencies
│       ├── Xargo.toml          # Cross-compilation config
│       └── src/
│           └── lib.rs          # Main program code
└── tests/
    └── solsplit.ts             # Test suite
```

## 🐛 Error Codes

| Error | Description |
|-------|-------------|
| `InvalidPercentages` | Percentages don't sum to 100 |
| `ZeroPercentage` | One or both percentages are 0 |
| `AlreadyExecuted` | Split has already been executed |
| `UnauthorizedSender` | Caller is not the original sender |
| `InvalidRecipient` | Recipient doesn't match configuration |
| `ZeroAmount` | Transfer amount is 0 |

## 📝 Example Flow

```typescript
// 1. Setup accounts
const sender = provider.wallet;
const recipient1 = anchor.web3.Keypair.generate();
const recipient2 = anchor.web3.Keypair.generate();

// 2. Derive PDA
const [splitConfigPDA] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("split_config"), sender.publicKey.toBuffer()],
  program.programId
);

// 3. Initialize (70/30 split)
await program.methods
  .initializeSplit(70, 30)
  .accounts({ /* ... */ })
  .rpc();

// 4. Execute with 2 SOL
await program.methods
  .executeSplit(new anchor.BN(2_000_000_000))
  .accounts({ /* ... */ })
  .rpc();

// Result: recipient1 gets 1.4 SOL, recipient2 gets 0.6 SOL
```

## 🚀 Deployment

### Devnet Deployment

```bash
# Configure for devnet
solana config set --url devnet

# Airdrop SOL for deployment
solana airdrop 2

# Deploy
anchor deploy
```

### Mainnet Deployment

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Deploy (requires SOL for deployment fees)
anchor deploy
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## ⚠️ Disclaimer

This software is provided "as is" without warranty. Use at your own risk. Always audit smart contracts before deploying to mainnet.

## 🔗 Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Solana Cookbook](https://solanacookbook.com/)

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review the test suite for usage examples