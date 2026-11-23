use anchor_lang::prelude::*;

// Placeholder: se reemplaza al ejecutar `anchor keys sync`
declare_id!("11111111111111111111111111111111");

#[program]
pub mod inventario {
    use super::*;

    /// CREACIÓN: la autoridad crea su bodega (PDA ["warehouse", authority]).
    pub fn initialize_warehouse(ctx: Context<InitializeWarehouse>, name: String) -> Result<()> {
        require!(!name.is_empty() && name.len() <= 32, InvError::InvalidName);
        let w = &mut ctx.accounts.warehouse;
        w.authority = ctx.accounts.authority.key();
        w.name = name;
        w.next_item_id = 0;
        w.active_items = 0;
        w.bump = ctx.bumps.warehouse;
        Ok(())
    }

    /// PERMISOS: la autoridad otorga rol de encargado (PDA ["manager", warehouse, manager]).
    pub fn add_manager(ctx: Context<AddManager>, manager_key: Pubkey) -> Result<()> {
        let m = &mut ctx.accounts.manager;
        m.warehouse = ctx.accounts.warehouse.key();
        m.manager = manager_key;
        m.bump = ctx.bumps.manager;
        Ok(())
    }

    /// PERMISOS: la autoridad revoca el rol (cierra la cuenta y recupera renta).
    pub fn remove_manager(_ctx: Context<RemoveManager>) -> Result<()> {
        Ok(())
    }

    /// CREACIÓN: nuevo producto (PDA ["item", warehouse, id]). Solo la autoridad.
    pub fn create_item(ctx: Context<CreateItem>, name: String, quantity: u32) -> Result<()> {
        require!(!name.is_empty() && name.len() <= 32, InvError::InvalidName);
        let w = &mut ctx.accounts.warehouse;
        let item = &mut ctx.accounts.item;
        item.warehouse = w.key();
        item.id = w.next_item_id;
        item.name = name;
        item.quantity = quantity;
        item.last_updated_by = ctx.accounts.authority.key();
        item.bump = ctx.bumps.item;
        w.next_item_id = w.next_item_id.checked_add(1).ok_or(InvError::Overflow)?;
        w.active_items = w.active_items.checked_add(1).ok_or(InvError::Overflow)?;
        Ok(())
    }

    /// MODIFICACIÓN: ajusta stock (+/-). Autoridad o encargado registrado.
    pub fn update_stock(ctx: Context<UpdateStock>, delta: i32) -> Result<()> {
        let w = &ctx.accounts.warehouse;
        let op = ctx.accounts.operator.key();
        let allowed = op == w.authority
            || ctx
                .accounts
                .manager
                .as_ref()
                .map_or(false, |m| m.warehouse == w.key() && m.manager == op);
        require!(allowed, InvError::Unauthorized);

        let item = &mut ctx.accounts.item;
        let new_q = (item.quantity as i64)
            .checked_add(delta as i64)
            .ok_or(InvError::Overflow)?;
        require!(new_q >= 0, InvError::InsufficientStock);
        require!(new_q <= u32::MAX as i64, InvError::Overflow);
        item.quantity = new_q as u32;
        item.last_updated_by = op;
        Ok(())
    }

    /// BAJA CONDICIONADA: solo se cierra el producto si su stock es 0.
    pub fn close_item(ctx: Context<CloseItem>) -> Result<()> {
        let w = &mut ctx.accounts.warehouse;
        w.active_items = w.active_items.checked_sub(1).ok_or(InvError::Overflow)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeWarehouse<'info> {
    #[account(
        init, payer = authority,
        space = 8 + Warehouse::INIT_SPACE,
        seeds = [b"warehouse", authority.key().as_ref()], bump
    )]
    pub warehouse: Account<'info, Warehouse>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(manager_key: Pubkey)]
pub struct AddManager<'info> {
    #[account(has_one = authority)]
    pub warehouse: Account<'info, Warehouse>,
    #[account(
        init, payer = authority,
        space = 8 + Manager::INIT_SPACE,
        seeds = [b"manager", warehouse.key().as_ref(), manager_key.as_ref()], bump
    )]
    pub manager: Account<'info, Manager>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveManager<'info> {
    #[account(has_one = authority)]
    pub warehouse: Account<'info, Warehouse>,
    #[account(mut, close = authority, has_one = warehouse)]
    pub manager: Account<'info, Manager>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateItem<'info> {
    #[account(mut, has_one = authority)]
    pub warehouse: Account<'info, Warehouse>,
    #[account(
        init, payer = authority,
        space = 8 + Item::INIT_SPACE,
        seeds = [b"item", warehouse.key().as_ref(), &warehouse.next_item_id.to_le_bytes()], bump
    )]
    pub item: Account<'info, Item>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateStock<'info> {
    pub warehouse: Account<'info, Warehouse>,
    #[account(mut, has_one = warehouse)]
    pub item: Account<'info, Item>,
    /// Requerida solo si el operador no es la autoridad.
    pub manager: Option<Account<'info, Manager>>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseItem<'info> {
    #[account(mut, has_one = authority)]
    pub warehouse: Account<'info, Warehouse>,
    #[account(
        mut, close = authority, has_one = warehouse,
        constraint = item.quantity == 0 @ InvError::ItemNotEmpty
    )]
    pub item: Account<'info, Item>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Warehouse {
    pub authority: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub next_item_id: u64,
    pub active_items: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Manager {
    pub warehouse: Pubkey,
    pub manager: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Item {
    pub warehouse: Pubkey,
    pub id: u64,
    #[max_len(32)]
    pub name: String,
    pub quantity: u32,
    pub last_updated_by: Pubkey,
    pub bump: u8,
}

#[error_code]
pub enum InvError {
    #[msg("El nombre debe tener entre 1 y 32 caracteres")]
    InvalidName,
    #[msg("No tienes permiso para esta operación")]
    Unauthorized,
    #[msg("Stock insuficiente")]
    InsufficientStock,
    #[msg("Solo se puede dar de baja un producto con stock 0")]
    ItemNotEmpty,
    #[msg("Desbordamiento numérico")]
    Overflow,
}
