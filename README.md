# 📦 Inventario Solana

**Ruta elegida:** proyecto propio.
**Program ID (Devnet):** `<PEGA_AQUÍ_TU_PROGRAM_ID>`
**Explorer:** https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet

## Propósito
Una dApp de inventario de bodega. Cada persona crea su propia bodega, registra productos,
otorga permisos a encargados que ajustan stock, y solo puede dar de baja un producto cuando su stock es 0.

## Modelo de cuentas (PDAs)
| Cuenta | Seeds | Contenido |
|---|---|---|
| `Warehouse` | `["warehouse", authority]` | autoridad, nombre, `next_item_id`, `active_items` |
| `Manager` | `["manager", warehouse, manager_pubkey]` | rol de encargado (permiso) |
| `Item` | `["item", warehouse, id_u64_le]` | nombre, cantidad, último editor |

## Instrucciones del programa
| Instrucción | Quién | Qué hace |
|---|---|---|
| `initialize_warehouse` | cualquiera | **Crea** la bodega |
| `create_item` | autoridad | **Crea** un producto |
| `update_stock(delta)` | autoridad o encargado | **Modifica** stock (no permite negativos) |
| `add_manager` / `remove_manager` | autoridad | **Permisos**: otorga / revoca rol |
| `close_item` | autoridad | **Baja condicionada**: solo si `quantity == 0`; devuelve la renta |
| (lectura) | cualquiera | `fetch`/`all` desde el cliente |

## Correspondencia con "Pruebas y evidencias"
| Requisito | Dónde se demuestra |
|---|---|
| Creación de cuentas | `initialize_warehouse`, `create_item`, `add_manager` |
| Lectura de cuentas | `fetchWarehouse/fetchItems/fetchManagers` en `app/src/client.ts` y la tabla del frontend |
| Modificación | `update_stock` |
| Permisos | `has_one = authority`, rol `Manager`, error `Unauthorized` para un extraño |
| Baja/cierre condicionado | `close_item` falla con `ItemNotEmpty` si hay stock; funciona con stock 0 |

Las pruebas (`tests/inventario.ts`) cubren los casos felices y los de rechazo.

## Requisitos
Rust, Solana CLI, Anchor 0.30.1, Node 18+, Yarn, wallet Phantom/Solflare en Devnet.

## Configuración y despliegue
```bash
yarn install
anchor build
anchor keys sync          # actualiza declare_id! y Anchor.toml con tu Program ID real
anchor build              # reconstruye con el ID correcto
anchor test               # pruebas en localnet

solana config set --url devnet
solana airdrop 2          # (repite si hace falta)
anchor deploy --provider.cluster devnet
```
Copia el Program ID en este README.

## Ejecutar el frontend
```bash
./scripts/sync-idl.sh     # copia target/idl/inventario.json a app/src/idl/
cd app && npm install && npm run dev
```
Abre http://localhost:5173 (o el puerto de Codespaces), conecta tu wallet en **Devnet**.

## Cómo probarlo
1. Conecta wallet → "Crear bodega".
2. Agrega un producto con stock 3 → verás la tabla.
3. Pulsa -1 tres veces → "Dar de baja" se habilita solo con stock 0.
4. Otorga permisos a otra wallet; desde esa wallet pega tu pubkey en el campo "Bodega" y ajusta stock.
5. Revoca al encargado.

## Aporte propio
Diseño de dominio propio (inventario con roles delegados por PDA), baja condicionada por regla
del programa, instrucción con cuenta opcional (`manager`) para autorización dual, y pruebas negativas.

## Evidencias
Capturas y hashes de transacciones en `evidencias/` (ver `evidencias/TRANSACCIONES.md`).

## Identificación
- Nombre para el certificado: `<TU NOMBRE>`
- Correo del registro: `<TU CORREO>`
