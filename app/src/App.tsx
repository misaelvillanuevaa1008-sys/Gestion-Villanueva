import { useCallback, useEffect, useMemo, useState } from "react";  
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import * as c from "./client";

export default function App() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const program = useMemo(() => (wallet ? c.getProgram(connection, wallet) : null), [connection, wallet]);

  const [ownerInput, setOwnerInput] = useState("");           // bodega a consultar (authority)
  const [wh, setWh] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [log, setLog] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [mgr, setMgr] = useState("");

  const owner = useMemo(() => {
    try { return ownerInput ? new PublicKey(ownerInput) : wallet?.publicKey ?? null; } catch { return null; }
  }, [ownerInput, wallet]);
  const isOwner = !!(wallet && owner && wallet.publicKey.equals(owner));

  const refresh = useCallback(async () => {
    if (!program || !owner) return;
    const pda = c.warehousePda(program.programId, owner);
    const w = await c.fetchWarehouse(program, pda);
    setWh(w);
    setItems(w ? (await c.fetchItems(program, pda)).sort((a: any, b: any) => a.account.id.cmp(b.account.id)) : []);
    setManagers(w ? await c.fetchManagers(program, pda) : []);
  }, [program, owner]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (label: string, fn: () => Promise<string>) => {
    try { const sig = await fn(); setLog(`✅ ${label}: ${sig}\nhttps://explorer.solana.com/tx/${sig}?cluster=devnet`); await refresh(); }
    catch (e: any) { setLog(`❌ ${label}: ${e.message ?? e}`); }
  };

  if (!wallet || !program) return (
    <div style={{ padding: 24 }}><h1>📦 Inventario Solana</h1><WalletMultiButton /></div>);

  const whPda = owner ? c.warehousePda(program.programId, owner) : null;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>📦 Inventario Solana (Devnet)</h1>
      <WalletMultiButton />
      <p><small>Program ID: {program.programId.toBase58()}</small></p>

      <label>Bodega (pubkey de la autoridad; vacío = la mía): </label>
      <input style={{ width: "100%" }} value={ownerInput} onChange={(e) => setOwnerInput(e.target.value)} />

      {!wh && isOwner && (
        <div style={{ marginTop: 16 }}>
          <p>No tienes bodega todavía.</p>
          <input placeholder="Nombre de la bodega" value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={() => run("Crear bodega", () => c.initWarehouse(program, wallet.publicKey, name))}>Crear bodega</button>
        </div>
      )}
      {!wh && !isOwner && <p>Esa bodega no existe.</p>}

      {wh && owner && whPda && (
        <>
          <h2>{wh.name} <small>({wh.activeItems.toString()} productos activos)</small></h2>

          {isOwner && (
            <div style={{ marginBottom: 12 }}>
              <input placeholder="Producto" value={name} onChange={(e) => setName(e.target.value)} />
              <input type="number" min={0} value={qty} onChange={(e) => setQty(+e.target.value)} style={{ width: 80 }} />
              <button onClick={() => run("Crear producto", () => c.createItem(program, owner, wh.nextItemId, name, qty))}>Agregar producto</button>
            </div>
          )}

          <table width="100%" border={1} cellPadding={6}>
            <thead><tr><th>ID</th><th>Producto</th><th>Stock</th><th>Acciones</th></tr></thead>
            <tbody>
              {items.map(({ account: it }) => (
                <tr key={it.id.toString()}>
                  <td>{it.id.toString()}</td><td>{it.name}</td><td>{it.quantity}</td>
                  <td>
                    <button onClick={() => run("+1", () => c.updateStock(program, whPda, owner, wallet.publicKey, it.id, 1))}>+1</button>{" "}
                    <button onClick={() => run("-1", () => c.updateStock(program, whPda, owner, wallet.publicKey, it.id, -1))}>-1</button>{" "}
                    {isOwner && (
                      <button disabled={it.quantity !== 0} title="Solo con stock 0"
                        onClick={() => run("Dar de baja", () => c.closeItem(program, owner, it.id))}>Dar de baja</button>)}
                  </td>
                </tr>))}
            </tbody>
          </table>

          {isOwner && (
            <>
              <h3>Encargados (permisos)</h3>
              <input style={{ width: "70%" }} placeholder="Pubkey del encargado" value={mgr} onChange={(e) => setMgr(e.target.value)} />
              <button onClick={() => run("Agregar encargado", () => c.addManager(program, owner, new PublicKey(mgr)))}>Otorgar</button>
              <ul>
                {managers.map(({ account: m }) => (
                  <li key={m.manager.toBase58()}>{m.manager.toBase58()}{" "}
                    <button onClick={() => run("Revocar", () => c.removeManager(program, owner, m.manager))}>Revocar</button></li>))}
              </ul>
            </>)}
        </>)}

      <pre style={{ whiteSpace: "pre-wrap", background: "#eee", padding: 8, marginTop: 16 }}>{log}</pre>
    </div>
  );
}
