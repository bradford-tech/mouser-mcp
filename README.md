# @bradford-tech/mouser-mcp

An [MCP](https://modelcontextprotocol.io) server for the [Mouser Electronics API](https://api.mouser.com/api/docs/ui/index): part search, BOM review, carts, order history and — opt-in — orders that are only placed after you type **APPROVE** into a confirmation prompt shown by the server. Built on [`@bradford-tech/mouser-sdk`](https://github.com/bradford-tech/mouser-sdk).

It runs locally over stdio with your own Mouser API keys. Works with Claude Code and Claude Desktop.

## Install

You need a Mouser **Search API key**, and for carts, order history and ordering an **Order API key**. Request both from the [Mouser API hub](https://www.mouser.com/api-hub/).

**Claude Code:**

```bash
claude mcp add mouser \
  --env MOUSER_SEARCH_API_KEY=your-search-key \
  --env MOUSER_ORDER_API_KEY=your-order-key \
  -- npx -y @bradford-tech/mouser-mcp
```

**Claude Desktop:** download `mouser-<version>.mcpb` from the [latest release](https://github.com/bradford-tech/mouser-mcp/releases/latest) and open it. Desktop asks for the keys in its settings and stores them securely. Or add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mouser": {
      "command": "npx",
      "args": ["-y", "@bradford-tech/mouser-mcp"],
      "env": {
        "MOUSER_SEARCH_API_KEY": "your-search-key",
        "MOUSER_ORDER_API_KEY": "your-order-key"
      }
    }
  }
}
```

### Configuration

| Variable                | Purpose                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `MOUSER_SEARCH_API_KEY` | Search tools.                                                                                                       |
| `MOUSER_ORDER_API_KEY`  | Cart, order information, order history and ordering tools. Optional; without it those tools explain what's missing. |
| `MOUSER_ENABLE_ORDERS`  | Set to `1` to add the order placement tools. **Off by default.**                                                    |

Requires Node 20 or newer.

## Tools

| Area              | Tools                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Search            | `search_parts`, `get_parts` (up to 200 part numbers, e.g. a BOM), `list_manufacturers`                                    |
| Cart              | `get_cart`, `add_to_cart`, `update_cart_items`, `remove_from_cart`, `manage_scheduled_releases`, `create_cart_from_order` |
| Order info        | `get_order_options`, `list_countries`, `list_currencies`, `get_order_history`, `get_order`                                |
| Ordering (opt-in) | `preview_order`, `submit_order`                                                                                           |

Things to know:

- **No parametric search.** Mouser can't filter or sort by specifications (capacitance, voltage, price). Search by keyword; Claude filters the returned descriptions.
- **Price breaks.** Mouser returns a handful of price breaks per part; quantities above the last break are priced at that break, not extrapolated. Each break has a display `price` string and a numeric `rawPrice` for arithmetic.
- **Search results are lighter than lookups.** `search_parts` leaves out links, on-order dates and compliance codes to keep pages small; `get_parts` returns them.
- **Datasheet links** come back only when Mouser's API provides them, and for many parts (e.g. TI and onsemi) it returns an empty value. The product page link always works and links the datasheet.
- **Dates** are returned as Mouser sends them (e.g. `2026-11-06T00:00:00`, no timezone).
- **Rate limits.** Mouser allows 30 calls a minute and 1,000 a day. The server queues calls to stay under the per-minute limit (a 200-line BOM takes about a minute) and says so plainly when the daily limit is reached.

## Placing orders

Ordering is off unless `MOUSER_ENABLE_ORDERS=1`. When on:

1. Claude builds a cart, then calls `preview_order`. Mouser prices the order (lines, tax, shipping, total) without placing it. The preview is kept in memory for 20 minutes and can be submitted once.
2. `submit_order` takes only the preview's ID. The server checks the cart hasn't changed, fetches fresh figures from Mouser, and shows **its own** confirmation prompt with the total. If the total changed since the preview, the prompt says so.
3. The order is placed only if you type **APPROVE** into that prompt (any case; quotes and surrounding spaces are fine). Anything else — `APPROV`, `yes`, cancelling the prompt — cancels it, and that preview can't be used again.

Claude never sees or relays the confirmation word, so it can't approve an order on your behalf. The final charge is Mouser's figure at the moment of submission.

The confirmation prompt needs a client that supports MCP elicitation: **Claude Code in interactive mode** does; Claude Desktop and non-interactive runs (`claude -p`, the Agent SDK) don't yet, and `submit_order` refuses there without contacting Mouser. You can still build carts in any client and check out on mouser.com.

### First live order (maintainers)

Order placement ships off by default until it has been verified against the live API:

1. In interactive Claude Code with `MOUSER_ENABLE_ORDERS=1`, build a cart with one low-value part and call `preview_order`. Check the cart on mouser.com is unchanged and no order exists.
2. Call `submit_order`. Confirm the prompt appears, shows the total, and that typing `APPROV` cancels it.
3. Preview again, submit, type `APPROVE`. Confirm the order number matches mouser.com.
4. Call `submit_order` again with the same preview ID and confirm it's refused.

## Development

```bash
git clone https://github.com/bradford-tech/mouser-mcp.git
cd mouser-mcp
npm install
npm test
```

```bash
npm run build        # compile to dist/
npm run fix          # prettier + eslint auto-fix, then type-check
npm run live-check   # read-only calls against the real API (keys from a local .env)
bash scripts/pack-mcpb.sh   # build the Claude Desktop bundle (after npm run build)
```

## License

[MIT](./LICENSE)
