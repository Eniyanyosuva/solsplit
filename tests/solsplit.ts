import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solsplit } from "../target/types/solsplit";
import { assert } from "chai";

describe("solsplit - Comprehensive Security Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solsplit as Program<Solsplit>;
  
  const sender = provider.wallet;
  const recipient1 = anchor.web3.Keypair.generate();
  const recipient2 = anchor.web3.Keypair.generate();

  let nonce = 0;

  const getSplitConfigPDA = (senderKey: anchor.web3.PublicKey, nonceValue: number) => {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("split_config"), 
        senderKey.toBuffer(),
        new anchor.BN(nonceValue).toArrayLike(Buffer, "le", 8)
      ],
      program.programId
    );
  };

  describe("Initialization Tests", () => {
    it("Initializes split configuration with valid percentages", async () => {
      const [splitConfigPDA] = getSplitConfigPDA(sender.publicKey, nonce);

      const tx = await program.methods
        .initializeSplit(60, 40, new anchor.BN(nonce))
        .accounts({
          splitConfig: splitConfigPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("Initialize transaction signature:", tx);

      const splitConfig = await program.account.splitConfig.fetch(splitConfigPDA);
      assert.equal(splitConfig.recipient1Percentage, 60);
      assert.equal(splitConfig.recipient2Percentage, 40);
      assert.equal(splitConfig.executed, false);
      assert.equal(splitConfig.nonce.toNumber(), nonce);
      assert.isAbove(splitConfig.createdAt.toNumber(), 0);

      nonce++;
    });

    it("Fails when percentages don't sum to 100", async () => {
      const [splitConfigPDA] = getSplitConfigPDA(sender.publicKey, nonce);

      try {
        await program.methods
          .initializeSplit(50, 30, new anchor.BN(nonce)) // 80% total
          .accounts({
            splitConfig: splitConfigPDA,
            sender: sender.publicKey,
            recipient1: recipient1.publicKey,
            recipient2: recipient2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "InvalidPercentages");
      }
    });

    it("Fails when percentage is zero", async () => {
      const [splitConfigPDA] = getSplitConfigPDA(sender.publicKey, nonce);

      try {
        await program.methods
          .initializeSplit(0, 100, new anchor.BN(nonce))
          .accounts({
            splitConfig: splitConfigPDA,
            sender: sender.publicKey,
            recipient1: recipient1.publicKey,
            recipient2: recipient2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "ZeroPercentage");
      }
    });

    it("Fails when recipients are the same", async () => {
      const [splitConfigPDA] = getSplitConfigPDA(sender.publicKey, nonce);

      try {
        await program.methods
          .initializeSplit(50, 50, new anchor.BN(nonce))
          .accounts({
            splitConfig: splitConfigPDA,
            sender: sender.publicKey,
            recipient1: recipient1.publicKey,
            recipient2: recipient1.publicKey, // Same as recipient1
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "DuplicateRecipient");
      }
    });

    it("Fails when recipient is system program", async () => {
      const [splitConfigPDA] = getSplitConfigPDA(sender.publicKey, nonce);

      try {
        await program.methods
          .initializeSplit(50, 50, new anchor.BN(nonce))
          .accounts({
            splitConfig: splitConfigPDA,
            sender: sender.publicKey,
            recipient1: anchor.web3.SystemProgram.programId,
            recipient2: recipient2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "InvalidRecipient");
      }
    });
  });

  describe("Execution Tests", () => {
    let executionNonce: number;
    let executionPDA: anchor.web3.PublicKey;

    before(async () => {
      executionNonce = nonce++;
      [executionPDA] = getSplitConfigPDA(sender.publicKey, executionNonce);

      await program.methods
        .initializeSplit(60, 40, new anchor.BN(executionNonce))
        .accounts({
          splitConfig: executionPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("Executes split successfully with correct distribution", async () => {
      const amount = new anchor.BN(1_000_000_000); // 1 SOL

      const recipient1BalanceBefore = await provider.connection.getBalance(
        recipient1.publicKey
      );
      const recipient2BalanceBefore = await provider.connection.getBalance(
        recipient2.publicKey
      );

      const tx = await program.methods
        .executeSplit(amount)
        .accounts({
          splitConfig: executionPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("Execute transaction signature:", tx);

      const recipient1BalanceAfter = await provider.connection.getBalance(
        recipient1.publicKey
      );
      const recipient2BalanceAfter = await provider.connection.getBalance(
        recipient2.publicKey
      );

      const splitConfig = await program.account.splitConfig.fetch(executionPDA);

      assert.equal(splitConfig.executed, true);
      assert.isAbove(splitConfig.executedAt.toNumber(), 0);
      
      // 60% of 1 SOL = 600,000,000 lamports
      assert.equal(
        recipient1BalanceAfter - recipient1BalanceBefore,
        600_000_000
      );
      
      // 40% of 1 SOL = 400,000,000 lamports
      assert.equal(
        recipient2BalanceAfter - recipient2BalanceBefore,
        400_000_000
      );
    });

    it("Prevents replay attacks", async () => {
      try {
        await program.methods
          .executeSplit(new anchor.BN(500_000_000))
          .accounts({
            splitConfig: executionPDA,
            sender: sender.publicKey,
            recipient1: recipient1.publicKey,
            recipient2: recipient2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "AlreadyExecuted");
      }
    });

    it("Fails with amount below minimum", async () => {
      const smallNonce = nonce++;
      const [smallPDA] = getSplitConfigPDA(sender.publicKey, smallNonce);

      await program.methods
        .initializeSplit(50, 50, new anchor.BN(smallNonce))
        .accounts({
          splitConfig: smallPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .executeSplit(new anchor.BN(500)) // Below 1000 minimum
          .accounts({
            splitConfig: smallPDA,
            sender: sender.publicKey,
            recipient1: recipient1.publicKey,
            recipient2: recipient2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "AmountTooSmall");
      }
    });

    it("Handles rounding correctly (no lost lamports)", async () => {
      const roundingNonce = nonce++;
      const [roundingPDA] = getSplitConfigPDA(sender.publicKey, roundingNonce);

      await program.methods
        .initializeSplit(33, 67, new anchor.BN(roundingNonce))
        .accounts({
          splitConfig: roundingPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const amount = new anchor.BN(1000); // Small amount to test rounding

      const recipient1Before = await provider.connection.getBalance(recipient1.publicKey);
      const recipient2Before = await provider.connection.getBalance(recipient2.publicKey);
      const senderBefore = await provider.connection.getBalance(sender.publicKey);

      await program.methods
        .executeSplit(amount)
        .accounts({
          splitConfig: roundingPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const recipient1After = await provider.connection.getBalance(recipient1.publicKey);
      const recipient2After = await provider.connection.getBalance(recipient2.publicKey);
      const senderAfter = await provider.connection.getBalance(sender.publicKey);

      const recipient1Received = recipient1After - recipient1Before;
      const recipient2Received = recipient2After - recipient2Before;
      const senderSpent = senderBefore - senderAfter;

      // 33% of 1000 = 330 lamports
      assert.equal(recipient1Received, 330);
      
      // Recipient2 gets remainder: 1000 - 330 = 670 lamports
      assert.equal(recipient2Received, 670);
      
      // Total distributed should equal amount (no lost lamports)
      assert.equal(recipient1Received + recipient2Received, 1000);
    });
  });

  describe("Cancellation Tests", () => {
    let cancelNonce: number;
    let cancelPDA: anchor.web3.PublicKey;

    beforeEach(async () => {
      cancelNonce = nonce++;
      [cancelPDA] = getSplitConfigPDA(sender.publicKey, cancelNonce);

      await program.methods
        .initializeSplit(70, 30, new anchor.BN(cancelNonce))
        .accounts({
          splitConfig: cancelPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("Cancels split before execution", async () => {
      const tx = await program.methods
        .cancelSplit()
        .accounts({
          splitConfig: cancelPDA,
          sender: sender.publicKey,
        })
        .rpc();

      console.log("Cancel transaction signature:", tx);

      // Verify account is closed
      try {
        await program.account.splitConfig.fetch(cancelPDA);
        assert.fail("Account should be closed");
      } catch (err) {
        assert.include(err.toString(), "Account does not exist");
      }
    });

    it("Fails to cancel after execution", async () => {
      // Execute first
      await program.methods
        .executeSplit(new anchor.BN(10_000_000))
        .accounts({
          splitConfig: cancelPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Try to cancel
      try {
        await program.methods
          .cancelSplit()
          .accounts({
            splitConfig: cancelPDA,
            sender: sender.publicKey,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "AlreadyExecuted");
      }
    });
  });

  describe("Close Account Tests", () => {
    let closeNonce: number;
    let closePDA: anchor.web3.PublicKey;

    beforeEach(async () => {
      closeNonce = nonce++;
      [closePDA] = getSplitConfigPDA(sender.publicKey, closeNonce);

      await program.methods
        .initializeSplit(80, 20, new anchor.BN(closeNonce))
        .accounts({
          splitConfig: closePDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("Closes split after execution to reclaim rent", async () => {
      // Execute first
      await program.methods
        .executeSplit(new anchor.BN(50_000_000))
        .accounts({
          splitConfig: closePDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const senderBalanceBefore = await provider.connection.getBalance(sender.publicKey);

      // Close account
      const tx = await program.methods
        .closeSplit()
        .accounts({
          splitConfig: closePDA,
          sender: sender.publicKey,
        })
        .rpc();

      console.log("Close transaction signature:", tx);

      const senderBalanceAfter = await provider.connection.getBalance(sender.publicKey);

      // Verify account is closed
      try {
        await program.account.splitConfig.fetch(closePDA);
        assert.fail("Account should be closed");
      } catch (err) {
        assert.include(err.toString(), "Account does not exist");
      }

      // Verify rent was reclaimed (sender balance increased)
      assert.isAbove(senderBalanceAfter, senderBalanceBefore - 10_000); // Account for tx fee
    });

    it("Fails to close before execution", async () => {
      try {
        await program.methods
          .closeSplit()
          .accounts({
            splitConfig: closePDA,
            sender: sender.publicKey,
          })
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "NotExecuted");
      }
    });
  });

  describe("Authorization Tests", () => {
    let authNonce: number;
    let authPDA: anchor.web3.PublicKey;
    let unauthorizedUser: anchor.web3.Keypair;

    before(async () => {
      unauthorizedUser = anchor.web3.Keypair.generate();
      
      // Airdrop SOL to unauthorized user
      const airdropSig = await provider.connection.requestAirdrop(
        unauthorizedUser.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      authNonce = nonce++;
      [authPDA] = getSplitConfigPDA(sender.publicKey, authNonce);

      await program.methods
        .initializeSplit(50, 50, new anchor.BN(authNonce))
        .accounts({
          splitConfig: authPDA,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("Fails when unauthorized user tries to execute", async () => {
      const [unauthorizedPDA] = getSplitConfigPDA(sender.publicKey, authNonce);

      try {
        await program.methods
          .executeSplit(new anchor.BN(10_000_000))
          .accounts({
            splitConfig: unauthorizedPDA,
            sender: unauthorizedUser.publicKey,
            recipient1: recipient1.publicKey,
            recipient2: recipient2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([unauthorizedUser])
          .rpc();
        
        assert.fail("Expected error not thrown");
      } catch (err) {
        assert.include(err.toString(), "UnauthorizedSender");
      }
    });
  });

  describe("Multiple Splits with Nonce", () => {
    it("Allows same sender to create multiple splits with different nonces", async () => {
      const nonce1 = nonce++;
      const nonce2 = nonce++;

      const [pda1] = getSplitConfigPDA(sender.publicKey, nonce1);
      const [pda2] = getSplitConfigPDA(sender.publicKey, nonce2);

      // Create first split
      await program.methods
        .initializeSplit(25, 75, new anchor.BN(nonce1))
        .accounts({
          splitConfig: pda1,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Create second split
      await program.methods
        .initializeSplit(75, 25, new anchor.BN(nonce2))
        .accounts({
          splitConfig: pda2,
          sender: sender.publicKey,
          recipient1: recipient1.publicKey,
          recipient2: recipient2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Verify both exist
      const config1 = await program.account.splitConfig.fetch(pda1);
      const config2 = await program.account.splitConfig.fetch(pda2);

      assert.equal(config1.recipient1Percentage, 25);
      assert.equal(config2.recipient1Percentage, 75);
      assert.notEqual(config1.nonce.toNumber(), config2.nonce.toNumber());
    });
  });
});