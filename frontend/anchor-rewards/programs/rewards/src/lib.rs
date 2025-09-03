use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("YourDeployedProgramIdHere");

#[program]
pub mod rewards {
    use super::*;

    #[account]
    pub struct RewardPool {
        pub vault: Pubkey,  // SPL token vault (SOL wrapped)
        pub authority: Pubkey,
    }

    #[account]
    pub struct UserReward {
        pub user: Pubkey,  // App user ID or email hash
        pub amount: u64,
    }

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.pool.vault = ctx.accounts.vault.key();
        ctx.accounts.pool.authority = ctx.accounts.authority.key();
        Ok(())
    }

    pub fn add_reward(ctx: Context<AddReward>, amount: u64) -> Result<()> {
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.payer.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.payer_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::transfer(cpi_ctx, amount)?;

        ctx.accounts.user_reward.amount += amount;
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>, amount: u64) -> Result<()> {
        require!(ctx.accounts.user_reward.amount >= amount, ErrorCode::InsufficientRewards);

        let seeds = &[b"authority".as_ref()];
        let signer = &[&seeds[..]];

        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.destination.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        anchor_spl::token::transfer(cpi_ctx, amount)?;

        ctx.accounts.user_reward.amount -= amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = 8 + 32 + 32)]
    pub pool: Account<'info, RewardPool>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub vault: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddReward<'info> {
    #[account(mut)]
    pub user_reward: Account<'info, UserReward>,
    pub payer: Account<'info, TokenAccount>,
    pub payer_authority: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(has_authority = authority)]
    pub pool: Account<'info, RewardPool>,
    #[account(mut)]
    pub user_reward: Account<'info, UserReward>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient rewards")]
    InsufficientRewards,
}