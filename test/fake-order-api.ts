import { mouserWithFetch } from "./helpers.js";

export interface OrderBody {
  Order: Record<string, unknown> & { SubmitOrder?: boolean };
}

/**
 * A fake Mouser order API. `cartQuantity` and `total` can be changed between
 * calls to simulate a cart edited after preview or a re-priced order.
 */
export function fakeMouser() {
  const state = { cartQuantity: 10, total: 4.2 };
  const orderBodies: OrderBody[] = [];
  const { client, requests } = mouserWithFetch(async (req) => {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/v1/cart") {
      return {
        CartKey: "cart-1",
        CurrencyCode: "USD",
        CartItems: [
          { MouserPartNumber: "595-LM358DR", Quantity: state.cartQuantity },
        ],
      };
    }
    if (pathname === "/api/v1/order") {
      const body = (await req.json()) as OrderBody;
      orderBodies.push(body);
      return {
        Order: {
          CurrencyCode: "USD",
          MerchandiseTotal: state.total,
          TaxAmount: 0,
          OrderTotal: state.total,
          ShippingMethod: { PrimaryMethod: "UPS Ground" },
          OrderLines: [
            {
              MouserPartNumber: "595-LM358DR",
              Quantity: state.cartQuantity,
              UnitPrice: 0.42,
              ExtendedPrice: state.total,
            },
          ],
          ...(body.Order.SubmitOrder ? { OrderID: "WO-777" } : {}),
        },
      };
    }
    return new Response("not found", { status: 404 });
  });
  const submits = () => orderBodies.filter((b) => b.Order.SubmitOrder === true);
  return { client, requests, state, orderBodies, submits };
}
