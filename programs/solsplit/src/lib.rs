use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("7dChiG6VDtneaVXxd2gdtg6MxsPXTvYUnEPEgP4sFKts");

// Minimum split amount to prevent dust attacks
const MINIMUM_SPLIT_AMOUNT: u64 = 1000; // 0.000001 SOL

#[program]
pub mod solsplit {
    use super::*;

    /// Initialize a new split configuration
    pub fn initialize_split(
        ctx: Context<InitializeSplit>,
        recipient1_percentage: u8,
        recipient2_percentage: u8,
        nonce: u64,
    ) -> Result<()> {
        // Validate percentages sum to exactly 100
        require!(
            recipient1_percentage + recipient2_percentage == 100,
            SplitError::InvalidPercentages
        );

        // Validate percentages are non-zero
        require!(
            recipient1_percentage > 0 && recipient2_percentage > 0,
            SplitError::ZeroPercentage
        );

        // Validate recipients are not the same
        require!(
            ctx.accounts.recipient1.key() != ctx.accounts.recipient2.key(),
            SplitError::DuplicateRecipient
        );

        // Validate recipients are not system program
        require!(
            ctx.accounts.recipient1.key() != ctx.accounts.system_program.key(),
            SplitError::InvalidRecipient
        );
        require!(
            ctx.accounts.recipient2.key() != ctx.accounts.system_program.key(),
            SplitError::InvalidRecipient
        );

        let split_config = &mut ctx.accounts.split_config;
        let clock = Clock::get()?;
        
        split_config.sender = ctx.accounts.sender.key();
        split_config.recipient1 = ctx.accounts.recipient1.key();
        split_config.recipient2 = ctx.accounts.recipient2.key();
        split_config.recipient1_percentage = recipient1_percentage;
        split_config.recipient2_percentage = recipient2_percentage;
        split_config.executed = false;
        split_config.nonce = nonce;
        split_config.created_at = clock.unix_timestamp;
        split_config.executed_at = 0;
        split_config.bump = ctx.bumps.split_config;

        emit!(SplitInitialized {
            sender: split_config.sender,
            recipient1: split_config.recipient1,
            recipient2: split_config.recipient2,
            recipient1_percentage,
            recipient2_percentage,
            nonce,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Split initialized: {}% / {}%, nonce: {}", 
            recipient1_percentage, 
            recipient2_percentage,
            nonce
        );
        
        Ok(())
    }

    /// Execute the split by transferring SOL to recipients
    pub fn execute_split(ctx: Context<ExecuteSplit>, amount: u64) -> Result<()> {
        let split_config = &mut ctx.accounts.split_config;

        // Ensure split hasn't been executed yet
        require!(!split_config.executed, SplitError::AlreadyExecuted);

        // Validate sender matches the original configuration
        require!(
            split_config.sender == ctx.accounts.sender.key(),
            SplitError::UnauthorizedSender
        );

        // Validate recipients match configuration
        require!(
            split_config.recipient1 == ctx.accounts.recipient1.key(),
            SplitError::InvalidRecipient
        );
        require!(
            split_config.recipient2 == ctx.accounts.recipient2.key(),
            SplitError::InvalidRecipient
        );

        // Validate minimum amount to prevent dust
        require!(amount >= MINIMUM_SPLIT_AMOUNT, SplitError::AmountTooSmall);

        // Calculate amount for recipient 1 with safe math
        let amount1 = (amount as u128)
            .checked_mul(split_config.recipient1_percentage as u128)
            .ok_or(SplitError::MathOverflow)?
            .checked_div(100)
            .ok_or(SplitError::MathOverflow)? as u64;

        // Calculate amount2 as remainder to avoid rounding errors
        let amount2 = amount
            .checked_sub(amount1)
            .ok_or(SplitError::MathOverflow)?;

        // Verify sender has sufficient balance
        let sender_balance = ctx.accounts.sender.get_lamports();
        require!(
            sender_balance >= amount,
            SplitError::InsufficientBalance
        );

        // Transfer to recipient 1
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.sender.to_account_info(),
                    to: ctx.accounts.recipient1.to_account_info(),
                },
            ),
            amount1,
        )?;

        // Transfer to recipient 2
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.sender.to_account_info(),
                    to: ctx.accounts.recipient2.to_account_info(),
                },
            ),
            amount2,
        )?;

        // Mark as executed to prevent replay
        let clock = Clock::get()?;
        split_config.executed = true;
        split_config.executed_at = clock.unix_timestamp;

        emit!(SplitExecuted {
            sender: split_config.sender,
            recipient1: split_config.recipient1,
            recipient2: split_config.recipient2,
            amount1,
            amount2,
            total_amount: amount,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "Split executed: {} lamports to recipient1, {} lamports to recipient2", 
            amount1, 
            amount2
        );

        Ok(())
    }

    /// Cancel a split configuration before execution
    pub fn cancel_split(ctx: Context<CancelSplit>) -> Result<()> {
        let split_config = &ctx.accounts.split_config;

        // Ensure split hasn't been executed yet
        require!(!split_config.executed, SplitError::AlreadyExecuted);

        // Validate sender matches
        require!(
            split_config.sender == ctx.accounts.sender.key(),
            SplitError::UnauthorizedSender
        );

        emit!(SplitCancelled {
            sender: split_config.sender,
            nonce: split_config.nonce,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Split cancelled, nonce: {}", split_config.nonce);

        // Account will be closed automatically via close constraint
        Ok(())
    }

    /// Close a split configuration after execution to reclaim rent
    pub fn close_split(ctx: Context<CloseSplit>) -> Result<()> {
        let split_config = &ctx.accounts.split_config;

        // Ensure split has been executed
        require!(split_config.executed, SplitError::NotExecuted);

        // Validate sender matches
        require!(
            split_config.sender == ctx.accounts.sender.key(),
            SplitError::UnauthorizedSender
        );

        emit!(SplitClosed {
            sender: split_config.sender,
            nonce: split_config.nonce,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Split closed, rent reclaimed, nonce: {}", split_config.nonce);

        // Account will be closed automatically via close constraint
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(recipient1_percentage: u8, recipient2_percentage: u8, nonce: u64)]
pub struct InitializeSplit<'info> {
    #[account(
        init,
        payer = sender,
        space = 8 + SplitConfig::INIT_SPACE,
        seeds = [b"split_config", sender.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub split_config: Account<'info, SplitConfig>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
    
    /// CHECK: Validated in instruction logic
    pub recipient1: AccountInfo<'info>,
    
    /// CHECK: Validated in instruction logic
    pub recipient2: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteSplit<'info> {
    #[account(
        mut,
        seeds = [b"split_config", sender.key().as_ref(), &split_config.nonce.to_le_bytes()],
        bump = split_config.bump,
    )]
    pub split_config: Account<'info, SplitConfig>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
    
    /// CHECK: Validated against split_config
    #[account(mut)]
    pub recipient1: AccountInfo<'info>,
    
    /// CHECK: Validated against split_config
    #[account(mut)]
    pub recipient2: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelSplit<'info> {
    #[account(
        mut,
        close = sender,
        seeds = [b"split_config", sender.key().as_ref(), &split_config.nonce.to_le_bytes()],
        bump = split_config.bump,
        constraint = !split_config.executed @ SplitError::AlreadyExecuted
    )]
    pub split_config: Account<'info, SplitConfig>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseSplit<'info> {
    #[account(
        mut,
        close = sender,
        seeds = [b"split_config", sender.key().as_ref(), &split_config.nonce.to_le_bytes()],
        bump = split_config.bump,
        constraint = split_config.executed @ SplitError::NotExecuted
    )]
    pub split_config: Account<'info, SplitConfig>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct SplitConfig {
    pub sender: Pubkey,
    pub recipient1: Pubkey,
    pub recipient2: Pubkey,
    pub recipient1_percentage: u8,
    pub recipient2_percentage: u8,
    pub executed: bool,
    pub nonce: u64,
    pub created_at: i64,
    pub executed_at: i64,
    pub bump: u8,
}

#[event]
pub struct SplitInitialized {
    pub sender: Pubkey,
    pub recipient1: Pubkey,
    pub recipient2: Pubkey,
    pub recipient1_percentage: u8,
    pub recipient2_percentage: u8,
    pub nonce: u64,
    pub timestamp: i64,
}

#[event]
pub struct SplitExecuted {
    pub sender: Pubkey,
    pub recipient1: Pubkey,
    pub recipient2: Pubkey,
    pub amount1: u64,
    pub amount2: u64,
    pub total_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct SplitCancelled {
    pub sender: Pubkey,
    pub nonce: u64,
    pub timestamp: i64,
}

#[event]
pub struct SplitClosed {
    pub sender: Pubkey,
    pub nonce: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum SplitError {
    #[msg("Percentages must sum to exactly 100")]
    InvalidPercentages,
    
    #[msg("Percentage cannot be zero")]
    ZeroPercentage,
    
    #[msg("Split has already been executed")]
    AlreadyExecuted,
    
    #[msg("Split has not been executed yet")]
    NotExecuted,
    
    #[msg("Unauthorized sender")]
    UnauthorizedSender,
    
    #[msg("Invalid recipient address")]
    InvalidRecipient,
    
    #[msg("Amount must be at least 1000 lamports")]
    AmountTooSmall,
    
    #[msg("Math operation overflow")]
    MathOverflow,
    
    #[msg("Insufficient balance")]
    InsufficientBalance,
    
    #[msg("Recipients must be different addresses")]
    DuplicateRecipient,
}