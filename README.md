# SolSplit

SolSplit is a minimal, secure Solana smart contract that enables splitting a SOL payment between two recipients based on predefined percentage allocations.  
The project is built using **Rust** and the **Anchor framework**, focusing on correctness, security, and clean protocol-style design.

This repository is intentionally small but production-oriented, demonstrating real Solana development concepts rather than tutorial-style code.

---

## 🚀 Features

- Secure SOL payment splitting
- Program Derived Account (PDA) for state management
- Percentage validation (must total exactly 100%)
- One-time execution protection (prevents replay attacks)
- Clean and minimal Anchor-based architecture

---

## 🧠 How It Works

1. A sender initializes a split configuration by specifying:
   - Two recipient wallet addresses
   - Percentage allocation for each recipient
2. The configuration is stored in a PDA-derived state account.
3. The sender executes the split by sending SOL.
4. SOL is transferred atomically to both recipients according to the configured percentages.
5. The split is permanently marked as executed and cannot be reused.

---

## 📐 Architecture

### Program Derived Account (PDA)

The split configuration is stored in a PDA derived using deterministic seeds:
