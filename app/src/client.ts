// Cliente tipado por el IDL: todas las instrucciones y cuentas salen de inventario.json
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./idl/inventario.json";

export const getProgram = (connection: Connection, wallet: any) =>
  new Program(idl as any, new AnchorProvider(connection, wallet, { commitment: "confirmed" }));

type P = ReturnType<typeof getProgram>;
const enc = (s: string) => Buffer.from(s);

export const warehousePda = (programId: PublicKey, authority: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("warehouse"), authority.toBuffer()], programId)[0];
export const managerPda = (programId: PublicKey, warehouse: PublicKey, manager: PublicKey) =>
  PublicKey.findProgramAddressSync([enc("manager"), warehouse.toBuffer(), manager.toBuffer()], programId)[0];
export const itemPda = (programId: PublicKey, warehouse: PublicKey, id: number | BN) =>
  PublicKey.findProgramAddressSync(
    [enc("item"), warehouse.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)], programId)[0];

// ---- Lectura ----
export const fetchWarehouse = (p: P, w: PublicKey) => (p.account as any).warehouse.fetchNullable(w);
export const fetchItems = (p: P, w: PublicKey) =>
  (p.account as any).item.all([{ memcmp: { offset: 8, bytes: w.toBase58() } }]);
export const fetchManagers = (p: P, w: PublicKey) =>
  (p.account as any).manager.all([{ memcmp: { offset: 8, bytes: w.toBase58() } }]);

// ---- Escritura ----
export const initWarehouse = (p: P, authority: PublicKey, name: string) =>
  p.methods.initializeWarehouse(name).accounts({
    warehouse: warehousePda(p.programId, authority), authority, systemProgram: SystemProgram.programId,
  } as any).rpc();

export const createItem = (p: P, authority: PublicKey, nextId: BN, name: string, qty: number) => {
  const warehouse = warehousePda(p.programId, authority);
  return p.methods.createItem(name, qty).accounts({
    warehouse, item: itemPda(p.programId, warehouse, nextId), authority, systemProgram: SystemProgram.programId,
  } as any).rpc();
};

export const updateStock = (p: P, warehouse: PublicKey, authorityKey: PublicKey,
  operator: PublicKey, itemId: BN, delta: number) =>
  p.methods.updateStock(delta).accounts({
    warehouse, item: itemPda(p.programId, warehouse, itemId),
    manager: operator.equals(authorityKey) ? null : managerPda(p.programId, warehouse, operator),
    operator,
  } as any).rpc();

export const closeItem = (p: P, authority: PublicKey, itemId: BN) => {
  const warehouse = warehousePda(p.programId, authority);
  return p.methods.closeItem().accounts({
    warehouse, item: itemPda(p.programId, warehouse, itemId), authority,
  } as any).rpc();
};

export const addManager = (p: P, authority: PublicKey, manager: PublicKey) => {
  const warehouse = warehousePda(p.programId, authority);
  return p.methods.addManager(manager).accounts({
    warehouse, manager: managerPda(p.programId, warehouse, manager), authority,
    systemProgram: SystemProgram.programId,
  } as any).rpc();
};

export const removeManager = (p: P, authority: PublicKey, manager: PublicKey) => {
  const warehouse = warehousePda(p.programId, authority);
  return p.methods.removeManager().accounts({
    warehouse, manager: managerPda(p.programId, warehouse, manager), authority,
  } as any).rpc();
};
