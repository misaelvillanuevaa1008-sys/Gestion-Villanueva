import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { Inventario } from "../target/types/inventario";

describe("inventario", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Inventario as Program<Inventario>;
  const authority = provider.wallet.publicKey;
  const manager = Keypair.generate();
  const stranger = Keypair.generate();

  const [warehouse] = PublicKey.findProgramAddressSync(
    [Buffer.from("warehouse"), authority.toBuffer()], program.programId);
  const [managerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("manager"), warehouse.toBuffer(), manager.publicKey.toBuffer()], program.programId);
  const itemPda = (id: number) => PublicKey.findProgramAddressSync(
    [Buffer.from("item"), warehouse.toBuffer(), new BN(id).toArrayLike(Buffer, "le", 8)],
    program.programId)[0];

  const fund = async (kp: Keypair) => {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  };
  const expectFail = async (p: Promise<any>, msg: string) => {
    try { await p; } catch (e: any) { assert.include(e.toString(), msg); return; }
    assert.fail("La transacción debía fallar");
  };

  before(async () => { await fund(manager); await fund(stranger); });

  it("crea la bodega (PDA)", async () => {
    await program.methods.initializeWarehouse("Bodega Central")
      .accounts({ warehouse, authority, systemProgram: SystemProgram.programId }).rpc();
    const w = await program.account.warehouse.fetch(warehouse);
    assert.equal(w.name, "Bodega Central");
    assert.equal(w.activeItems.toNumber(), 0);
  });

  it("crea un producto y lo lee", async () => {
    await program.methods.createItem("Tornillos", 10)
      .accounts({ warehouse, item: itemPda(0), authority, systemProgram: SystemProgram.programId }).rpc();
    const it = await program.account.item.fetch(itemPda(0));
    assert.equal(it.quantity, 10);
    assert.equal(it.name, "Tornillos");
  });

  it("otorga permisos a un encargado", async () => {
    await program.methods.addManager(manager.publicKey)
      .accounts({ warehouse, manager: managerPda, authority, systemProgram: SystemProgram.programId }).rpc();
    const m = await program.account.manager.fetch(managerPda);
    assert.equal(m.manager.toBase58(), manager.publicKey.toBase58());
  });

  it("el encargado modifica stock", async () => {
    await program.methods.updateStock(5)
      .accounts({ warehouse, item: itemPda(0), manager: managerPda, operator: manager.publicKey })
      .signers([manager]).rpc();
    assert.equal((await program.account.item.fetch(itemPda(0))).quantity, 15);
  });

  it("un extraño NO puede modificar stock", async () => {
    await expectFail(
      program.methods.updateStock(1)
        .accounts({ warehouse, item: itemPda(0), manager: null, operator: stranger.publicKey })
        .signers([stranger]).rpc(),
      "No tienes permiso");
  });

  it("no permite stock negativo", async () => {
    await expectFail(
      program.methods.updateStock(-100)
        .accounts({ warehouse, item: itemPda(0), manager: null, operator: authority }).rpc(),
      "Stock insuficiente");
  });

  it("NO cierra un producto con stock > 0", async () => {
    await expectFail(
      program.methods.closeItem().accounts({ warehouse, item: itemPda(0), authority }).rpc(),
      "stock 0");
  });

  it("cierra el producto cuando el stock llega a 0", async () => {
    await program.methods.updateStock(-15)
      .accounts({ warehouse, item: itemPda(0), manager: null, operator: authority }).rpc();
    await program.methods.closeItem().accounts({ warehouse, item: itemPda(0), authority }).rpc();
    assert.isNull(await provider.connection.getAccountInfo(itemPda(0)));
    assert.equal((await program.account.warehouse.fetch(warehouse)).activeItems.toNumber(), 0);
  });

  it("revoca al encargado", async () => {
    await program.methods.removeManager()
      .accounts({ warehouse, manager: managerPda, authority }).rpc();
    assert.isNull(await provider.connection.getAccountInfo(managerPda));
  });
});
