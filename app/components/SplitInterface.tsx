'use client';

import { FC, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { createInitializeSplitInstruction, createExecuteSplitInstruction } from '@/lib/instructions';
import dynamic from 'next/dynamic';

// Dynamically import wallet button to avoid SSR hydration issues
const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export const SplitInterface: FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [recipient1, setRecipient1] = useState('');
  const [recipient2, setRecipient2] = useState('');
  const [percentage1, setPercentage1] = useState(60);
  const [percentage2, setPercentage2] = useState(40);
  const [amount, setAmount] = useState('0.1');
  const [nonce, setNonce] = useState(Math.floor(Math.random() * 1000000));
  const [activeNonce, setActiveNonce] = useState(0); // Nonce used for current split
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [step, setStep] = useState<'config' | 'execute'>('config');

  const initializeSplit = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      setStatus('❌ Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      setStatus('⏳ Initializing split configuration...');
      
      // Save the nonce being used for this split
      const currentNonce = nonce;
      setActiveNonce(currentNonce);

      console.log('Wallet:', wallet.publicKey.toString());
      console.log('Recipient 1:', recipient1);
      console.log('Recipient 2:', recipient2);
      console.log('Percentages:', percentage1, percentage2);
      console.log('Nonce:', currentNonce);

      // Trim whitespace from addresses
      const recipient1Pubkey = new PublicKey(recipient1.trim());
      const recipient2Pubkey = new PublicKey(recipient2.trim());

      console.log('Creating instruction...');
      const instruction = createInitializeSplitInstruction(
        wallet.publicKey,
        recipient1Pubkey,
        recipient2Pubkey,
        percentage1,
        percentage2,
        currentNonce
      );

      console.log('Instruction created, building transaction...');
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = wallet.publicKey;

      console.log('Getting recent blockhash...');
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;

      console.log('Simulating transaction first...');
      try {
        const simulation = await connection.simulateTransaction(transaction);
        console.log('Simulation result:', simulation);
        
        if (simulation.value.err) {
          console.error('Simulation failed:', simulation.value.err);
          console.error('Simulation logs:', simulation.value.logs);
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}\nLogs: ${simulation.value.logs?.join('\n')}`);
        }
        console.log('Simulation successful!');
      } catch (simError: any) {
        console.error('Simulation error:', simError);
        throw simError;
      }

      console.log('Sending transaction...');
      console.log('Wallet adapter:', wallet.adapter?.name);
      
      if (!wallet.signTransaction) {
        throw new Error('Wallet does not support signing transactions');
      }

      // Sign the transaction
      const signedTx = await wallet.signTransaction(transaction);
      
      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      });
      
      const tx = signature;
      
      setStatus('📡 Transaction sent! Waiting for confirmation...');
      console.log('TX signature:', tx);

      const confirmation = await connection.confirmTransaction({
        signature: tx,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
      }

      setTxSignature(tx);
      setStatus('✅ Split initialized successfully! Now execute the split.');
      setStep('execute');
      setNonce(nonce + 1); // Auto-increment nonce for next split
      console.log('Initialize TX confirmed:', tx);
    } catch (error: any) {
      console.error('Full error object:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Error logs:', error.logs);
      setStatus(`❌ Error: ${error.message || 'Transaction failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const executeSplit = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setStatus('❌ Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      setStatus('💸 Executing payment split...');

      // Trim whitespace from addresses
      const recipient1Pubkey = new PublicKey(recipient1.trim());
      const recipient2Pubkey = new PublicKey(recipient2.trim());
      const amountLamports = new BN(parseFloat(amount) * LAMPORTS_PER_SOL);

      const instruction = createExecuteSplitInstruction(
        wallet.publicKey,
        recipient1Pubkey,
        recipient2Pubkey,
        amountLamports,
        activeNonce // Use the saved nonce from initialization
      );

      const transaction = new Transaction().add(instruction);
      transaction.feePayer = wallet.publicKey;

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;

      // Sign the transaction
      const signedTx = await wallet.signTransaction(transaction);
      
      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      });
      
      const tx = signature;
      
      setStatus('📡 Transaction sent! Waiting for confirmation...');
      console.log('Execute TX signature:', tx);
      
      const confirmation = await connection.confirmTransaction({
        signature: tx,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
      }

      setTxSignature(tx);
      
      // Calculate amounts sent
      const amount1 = (parseFloat(amount) * percentage1 / 100).toFixed(4);
      const amount2 = (parseFloat(amount) * percentage2 / 100).toFixed(4);
      
      setStatus(`🎉 Split executed successfully!\n\n💰 Sent ${amount1} SOL to Recipient 1\n💰 Sent ${amount2} SOL to Recipient 2\n\n✅ Transaction complete!`);
      console.log('Execute TX confirmed:', tx);
    } catch (error: any) {
      console.error('Error:', error);
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setRecipient1('');
    setRecipient2('');
    setPercentage1(60);
    setPercentage2(40);
    setAmount('0.1');
    setNonce(nonce + 1); // Auto-increment
    setStatus('');
    setTxSignature('');
    setStep('config');
  };

  // Auto-increment nonce when component mounts
  useState(() => {
    // Start with random nonce to avoid conflicts
    const randomNonce = Math.floor(Math.random() * 1000000);
    setNonce(randomNonce);
    setActiveNonce(randomNonce);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-pink-900 text-white overflow-hidden relative">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-96 h-96 bg-purple-500/20 rounded-full blur-3xl -top-48 -left-48 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-blue-500/20 rounded-full blur-3xl top-1/2 -right-48 animate-pulse delay-1000"></div>
        <div className="absolute w-96 h-96 bg-pink-500/20 rounded-full blur-3xl -bottom-48 left-1/2 animate-pulse delay-2000"></div>
      </div>

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-12 animate-fade-in">
          <div>
            <h1 className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 animate-gradient">
              SolSplit ⚡
            </h1>
            <p className="text-gray-400 mt-2">Split payments instantly on Solana</p>
            <p className="text-sm text-purple-300 mt-1">🌐 Connected to Devnet</p>
          </div>
          <WalletMultiButtonDynamic className="!bg-gradient-to-r !from-purple-600 !to-pink-600 hover:!from-purple-700 hover:!to-pink-700 !rounded-xl !font-semibold !shadow-lg !shadow-purple-500/50 !transition-all !duration-300 hover:!scale-105" />
        </div>

        {/* Progress Steps */}
        <div className="max-w-2xl mx-auto mb-8">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${step === 'config' ? 'bg-purple-600 shadow-lg shadow-purple-500/50' : 'bg-white/10'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step === 'config' ? 'bg-white text-purple-600' : 'bg-white/20'}`}>1</div>
              <span className="font-semibold">Configure</span>
            </div>
            <div className="w-12 h-1 bg-white/20 rounded"></div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${step === 'execute' ? 'bg-purple-600 shadow-lg shadow-purple-500/50' : 'bg-white/10'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step === 'execute' ? 'bg-white text-purple-600' : 'bg-white/20'}`}>2</div>
              <span className="font-semibold">Execute</span>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="max-w-2xl mx-auto bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 transform transition-all duration-500 hover:shadow-purple-500/20">
          
          {/* Recipients Section */}
          <div className="space-y-6 mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">👥</span> Recipients
            </h2>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Recipient 1 */}
              <div className="group">
                <label className="block text-sm font-medium mb-2 text-purple-300">Recipient 1</label>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient1}
                    onChange={(e) => setRecipient1(e.target.value.trim())}
                    onBlur={(e) => setRecipient1(e.target.value.trim())}
                    placeholder="Solana address..."
                    className="w-full px-4 py-3 bg-white/5 border-2 border-white/10 rounded-xl focus:outline-none focus:border-purple-400 transition-all duration-300 group-hover:border-white/20"
                  />
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/0 to-pink-500/0 group-hover:from-purple-500/5 group-hover:to-pink-500/5 pointer-events-none transition-all duration-300"></div>
                </div>
                <div className="mt-2 px-4 py-2 bg-purple-500/20 rounded-lg border border-purple-500/30">
                  <div className="text-xs text-purple-300 mb-1">Will receive</div>
                  <div className="text-lg font-bold text-purple-200">{percentage1}%</div>
                </div>
              </div>

              {/* Recipient 2 */}
              <div className="group">
                <label className="block text-sm font-medium mb-2 text-pink-300">Recipient 2</label>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient2}
                    onChange={(e) => setRecipient2(e.target.value.trim())}
                    onBlur={(e) => setRecipient2(e.target.value.trim())}
                    placeholder="Solana address..."
                    className="w-full px-4 py-3 bg-white/5 border-2 border-white/10 rounded-xl focus:outline-none focus:border-pink-400 transition-all duration-300 group-hover:border-white/20"
                  />
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-pink-500/0 to-purple-500/0 group-hover:from-pink-500/5 group-hover:to-purple-500/5 pointer-events-none transition-all duration-300"></div>
                </div>
                <div className="mt-2 px-4 py-2 bg-pink-500/20 rounded-lg border border-pink-500/30">
                  <div className="text-xs text-pink-300 mb-1">Will receive</div>
                  <div className="text-lg font-bold text-pink-200">{percentage2}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Percentage Slider */}
          <div className="mb-8 p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl border border-white/10">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-2xl">📊</span> Split Percentage
            </h3>
            <div className="relative pt-1">
              <input
                type="range"
                min="1"
                max="99"
                value={percentage1}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setPercentage1(val);
                  setPercentage2(100 - val);
                }}
                className="w-full h-3 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, rgb(168, 85, 247) 0%, rgb(168, 85, 247) ${percentage1}%, rgb(236, 72, 153) ${percentage1}%, rgb(236, 72, 153) 100%)`
                }}
              />
              <div className="flex justify-between mt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-300">{percentage1}%</div>
                  <div className="text-xs text-gray-400">Recipient 1</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-pink-300">{percentage2}%</div>
                  <div className="text-xs text-gray-400">Recipient 2</div>
                </div>
              </div>
            </div>
          </div>

          {/* Validation Warning */}
          {percentage1 + percentage2 !== 100 && (
            <div className="mb-6 p-4 bg-red-500/20 border-2 border-red-500/50 rounded-xl flex items-center gap-3 animate-shake">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="font-semibold">Invalid Split</div>
                <div className="text-sm text-gray-300">Percentages must sum to 100% (currently {percentage1 + percentage2}%)</div>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div className="mb-8">
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <span className="text-2xl">💰</span> Amount to Split (SOL)
            </label>
            <div className="relative group">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.001"
                min="0.001"
                placeholder="0.1"
                className="w-full px-6 py-4 bg-white/5 border-2 border-white/10 rounded-xl text-2xl font-bold focus:outline-none focus:border-blue-400 transition-all duration-300 group-hover:border-white/20"
              />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 pointer-events-none transition-all duration-300"></div>
            </div>
            
            {/* Amount Preview */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-3 bg-purple-500/20 rounded-lg border border-purple-500/30">
                <div className="text-xs text-purple-300 mb-1">Recipient 1 gets</div>
                <div className="text-xl font-bold text-purple-200">
                  {(parseFloat(amount || '0') * percentage1 / 100).toFixed(4)} SOL
                </div>
              </div>
              <div className="p-3 bg-pink-500/20 rounded-lg border border-pink-500/30">
                <div className="text-xs text-pink-300 mb-1">Recipient 2 gets</div>
                <div className="text-xl font-bold text-pink-200">
                  {(parseFloat(amount || '0') * percentage2 / 100).toFixed(4)} SOL
                </div>
              </div>
            </div>
          </div>

          {/* Nonce - Hidden but auto-managed */}
          <div className="mb-8" style={{ display: 'none' }}>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <span className="text-xl">🔢</span> Nonce (auto-managed)
            </label>
            <input
              type="number"
              value={nonce}
              onChange={(e) => setNonce(parseInt(e.target.value) || 0)}
              min="0"
              className="w-full px-4 py-3 bg-white/5 border-2 border-white/10 rounded-xl focus:outline-none focus:border-blue-400 transition-all duration-300"
              readOnly
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            {step === 'config' ? (
              <button
                onClick={initializeSplit}
                disabled={loading || !wallet.publicKey || percentage1 + percentage2 !== 100}
                className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 hover:scale-105 transform flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Initializing...
                  </>
                ) : (
                  <>
                    <span className="text-2xl">⚙️</span>
                    Initialize Split Configuration
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={executeSplit}
                  disabled={loading || !wallet.publicKey}
                  className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-green-500/50 hover:shadow-green-500/70 hover:scale-105 transform flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Executing...
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">🚀</span>
                      Execute Split & Send SOL
                    </>
                  )}
                </button>
                <button
                  onClick={resetForm}
                  disabled={loading}
                  className="w-full px-8 py-3 bg-white/10 rounded-xl font-semibold hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <span className="text-xl">🔄</span>
                  Start New Split
                </button>
              </div>
            )}
          </div>

          {/* Status */}
          {status && (
            <div className={`mt-6 p-5 rounded-xl border-2 transition-all duration-500 animate-slide-up ${
              status.includes('✅') || status.includes('🎉') 
                ? 'bg-green-500/20 border-green-500/50' 
                : status.includes('❌') 
                ? 'bg-red-500/20 border-red-500/50' 
                : 'bg-blue-500/20 border-blue-500/50'
            }`}>
              <p className="font-semibold text-lg mb-2 whitespace-pre-line">{status}</p>
              {txSignature && (
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 underline mt-2 transition-all duration-300 hover:gap-3"
                >
                  <span>View on Solana Explorer</span>
                  <span>→</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="max-w-2xl mx-auto mt-8 grid md:grid-cols-3 gap-4">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-5 border border-white/10 hover:border-purple-500/50 transition-all duration-300 hover:scale-105 transform">
            <div className="text-3xl mb-2">🔒</div>
            <h3 className="font-bold mb-1">Secure</h3>
            <p className="text-sm text-gray-400">One-time execution with replay protection</p>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-5 border border-white/10 hover:border-pink-500/50 transition-all duration-300 hover:scale-105 transform">
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-bold mb-1">Instant</h3>
            <p className="text-sm text-gray-400">Atomic transfers on Solana</p>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-5 border border-white/10 hover:border-blue-500/50 transition-all duration-300 hover:scale-105 transform">
            <div className="text-3xl mb-2">💎</div>
            <h3 className="font-bold mb-1">Transparent</h3>
            <p className="text-sm text-gray-400">All transactions verifiable on-chain</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes gradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.5s ease-out;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 1s ease-out;
        }
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.8);
        }
        input[type="range"]::-moz-range-thumb {
          width: 24px;
          height: 24px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.8);
        }
      `}</style>
    </div>
  );
};