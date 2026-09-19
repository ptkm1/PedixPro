import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtMoney } from "../../components/atoms/formatMoney";
import { useAuth } from "../../context/AuthContext";
import { useConfirm } from "../../context/ConfirmContext";
import { useAppToast } from "../../context/ToastContext";
import { apiFetch } from "../../lib/api";
import { enqueueOfflineSale } from "../../lib/offline-outbox";
import { postSellerSale } from "../../lib/offline-sale-sync";
import {
  buildRepeatSalePrefill,
  resolveRepeatSaleSource,
} from "../../lib/repeat-sale";
import {
  bumpCartQty,
  cartLineTotal,
  cycleCartLineDiscount,
  LAST_CUSTOMER_STORAGE_KEY,
  PRODUCT_DOUBLE_TAP_MS,
  syncCartLinesWithProducts,
} from "../../lib/sale/cart";
import {
  getCartStockBlockMessage,
  getProductStockBlockMessage,
} from "../../lib/sale/stock";
import type {
  CartLine,
  CreditOverview,
  PaymentCondition,
  QuickSaleTab,
  SaleCustomer,
  SaleProduct,
} from "../../lib/sale/types";
import { canAssignSaleSeller } from "../../lib/seller-login-messages";
import {
  fetchSellerCustomers,
  sellerOfflineStaleTime,
} from "../../lib/seller-offline-queries";
import { findProductByBarcode } from "../../lib/utils/barcode";
import { computeCatalogTileWidths } from "../../lib/utils/catalog-layout";
import { useNetInfoOnline } from "../useNetInfoOnline";
import { useOrderSyncMode } from "../useOrderSyncMode";
import { useSellerProductCatalog } from "../useSellerProductCatalog";
import {
  DIRECT_SALE_OPTION_LABEL,
  ORDER_SELLER_FILTER_DIRECT,
} from "@pedidos/shared";

type SubmitSaleResult =
  | { mode: "online"; status?: string }
  | { mode: "offlineQueued" };

type SaleSellerOption = { id: string; name: string };

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

function formatDoc(c: SaleCustomer): string {
  if (c.cnpj) {
    const d = digitsOnly(c.cnpj);
    if (d.length === 14) {
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    }
    return c.cnpj;
  }
  if (c.cpf) {
    const d = digitsOnly(c.cpf);
    if (d.length === 11) {
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    return c.cpf;
  }
  return "—";
}

export function useQuickSaleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useAppToast();
  const { alert } = useConfirm();
  const { customerId: customerIdParam, repeatSaleId: repeatSaleIdParam } =
    useLocalSearchParams<{
      customerId?: string;
      repeatSaleId?: string;
    }>();
  const repeatSaleId =
    typeof repeatSaleIdParam === "string" ? repeatSaleIdParam : undefined;
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const layout = computeCatalogTileWidths(useWindowDimensions().width);

  const canPickSeller = Boolean(user?.role && canAssignSaleSeller(user.role));
  const [assignedSellerId, setAssignedSellerId] = useState<string>(
    ORDER_SELLER_FILTER_DIRECT,
  );
  const [sellerPickerOpen, setSellerPickerOpen] = useState(false);

  const [tab, setTab] = useState<QuickSaleTab>("clientes");
  const [customerId, setCustomerIdState] = useState<string | undefined>();
  const [paymentConditionId, setPaymentConditionId] = useState<
    string | undefined
  >();
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [scanMsgOk, setScanMsgOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastCustomerId, setLastCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState({
    code: "",
    document: "",
    legalName: "",
    tradeName: "",
    city: "",
  });
  const [submittedCustomerSearch, setSubmittedCustomerSearch] = useState<{
    code: string;
    document: string;
    legalName: string;
    tradeName: string;
    city: string;
  } | null>(null);
  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const productTapTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const repeatAppliedRef = useRef<string | null>(null);

  const isOnline = useNetInfoOnline();
  const { orderSyncMode } = useOrderSyncMode();
  const catalog = useSellerProductCatalog({ customerId });
  const { products } = catalog;

  const setCustomerId = useCallback((id: string | undefined) => {
    setCustomerIdState(id);
    setPaymentConditionId(undefined);
    if (!id) setTab("clientes");
  }, []);

  useEffect(() => {
    if (repeatSaleId) return;
    if (typeof customerIdParam === "string" && customerIdParam.length > 0) {
      setCustomerIdState(customerIdParam);
    }
  }, [customerIdParam, repeatSaleId]);

  useEffect(() => {
    if (!repeatSaleId) return;
    if (repeatAppliedRef.current === repeatSaleId) return;
    let cancelled = false;

    void (async () => {
      const cachedList = qc.getQueryData<
        {
          id: string;
          status: string;
          customerId?: string | null;
          paymentConditionId?: string | null;
          items: {
            productId?: string;
            productName?: string;
            quantity: number;
            unitPrice?: unknown;
          }[];
        }[]
      >(["seller", "sales"]);
      const fromList = cachedList?.find((o) => o.id === repeatSaleId);
      const order =
        fromList?.items.some((i) => i.productId)
          ? fromList
          : await resolveRepeatSaleSource(repeatSaleId);

      if (cancelled) return;

      const prefill = order ? buildRepeatSalePrefill(order) : null;
      if (!prefill) {
        void alert({
          title: "Repetir venda",
          description: "Nenhuma venda anterior para repetir",
        });
        return;
      }

      repeatAppliedRef.current = repeatSaleId;
      if (prefill.customerId) setCustomerIdState(prefill.customerId);
      if (prefill.paymentConditionId) {
        setPaymentConditionId(prefill.paymentConditionId);
      }
      setCart(prefill.cart);
      setErr(null);
      setTab(prefill.customerId ? "produtos" : "clientes");
      showToast({
        message: "Venda anterior carregada — edite e finalize",
        tone: "success",
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [alert, qc, repeatSaleId, showToast]);

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["seller", "customers"],
    staleTime: sellerOfflineStaleTime,
    queryFn: () => fetchSellerCustomers() as Promise<SaleCustomer[]>,
  });

  const {
    data: searchedCustomers = [],
    isFetching: customerSearchLoading,
    error: customerSearchError,
  } = useQuery({
    queryKey: ["seller", "customers", "search", submittedCustomerSearch],
    enabled: submittedCustomerSearch !== null,
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(submittedCustomerSearch ?? {})) {
        if (value.trim()) params.set(key, value.trim());
      }
      return apiFetch<SaleCustomer[]>(`/seller/customers?${params.toString()}`);
    },
  });

  useEffect(() => {
    if (!customerId || customers.length === 0) return;
    const c = customers.find((x) => x.id === customerId);
    if (c?.approvalStatus && c.approvalStatus !== "APPROVED") {
      setCustomerIdState(undefined);
    }
  }, [customerId, customers]);

  const { data: paymentConditions = [] } = useQuery({
    queryKey: ["seller", "payment-conditions"],
    staleTime: sellerOfflineStaleTime,
    queryFn: () => apiFetch<PaymentCondition[]>("/seller/payment-conditions"),
  });

  const { data: saleSellers = [] } = useQuery({
    queryKey: ["seller", "sale-sellers"],
    enabled: canPickSeller,
    staleTime: sellerOfflineStaleTime,
    queryFn: () => apiFetch<SaleSellerOption[]>("/seller/sale-sellers"),
  });

  const assignedSellerLabel = useMemo(() => {
    if (!canPickSeller) return null;
    if (
      !assignedSellerId ||
      assignedSellerId === ORDER_SELLER_FILTER_DIRECT
    ) {
      return DIRECT_SALE_OPTION_LABEL;
    }
    return (
      saleSellers.find((s) => s.id === assignedSellerId)?.name ??
      DIRECT_SALE_OPTION_LABEL
    );
  }, [canPickSeller, assignedSellerId, saleSellers]);

  const apiAssignedSellerId = useMemo(() => {
    if (!canPickSeller) return undefined;
    if (
      !assignedSellerId ||
      assignedSellerId === ORDER_SELLER_FILTER_DIRECT
    ) {
      return null;
    }
    return assignedSellerId;
  }, [canPickSeller, assignedSellerId]);

  useEffect(() => {
    if (paymentConditionId) return;
    const cash = paymentConditions.find(
      (p) => p.days === 0 || p.code === "1" || /vista/i.test(p.name),
    );
    if (cash) setPaymentConditionId(cash.id);
    else if (paymentConditions[0])
      setPaymentConditionId(paymentConditions[0].id);
  }, [paymentConditions, paymentConditionId, customerId]);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(LAST_CUSTOMER_STORAGE_KEY).then((id) => {
      if (!cancelled && id) setLastCustomerId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      productTapTimers.current.forEach((t) => clearTimeout(t));
      productTapTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    setCart((prev) => syncCartLinesWithProducts(prev, products));
  }, [products]);

  useEffect(() => {
    if (!scanMsg) return;
    const t = setTimeout(() => {
      setScanMsg(null);
      setScanMsgOk(false);
    }, 3800);
    return () => clearTimeout(t);
  }, [scanMsg]);

  useEffect(() => {
    if (!customerId) return;
    void AsyncStorage.setItem(LAST_CUSTOMER_STORAGE_KEY, customerId);
    setLastCustomerId(customerId);
  }, [customerId]);

  const selectedCustomer = useMemo(() => {
    if (!customerId) return null;
    return customers.find((c) => c.id === customerId) ?? null;
  }, [customers, customerId]);

  const selectedPaymentCondition = useMemo(() => {
    if (!paymentConditionId) return null;
    return paymentConditions.find((p) => p.id === paymentConditionId) ?? null;
  }, [paymentConditions, paymentConditionId]);

  const lastCustomerEntity = useMemo(() => {
    if (!lastCustomerId) return null;
    const c = customers.find((x) => x.id === lastCustomerId) ?? null;
    if (c?.approvalStatus && c.approvalStatus !== "APPROVED") return null;
    return c;
  }, [customers, lastCustomerId]);

  const filteredCustomers = useMemo(
    () => (submittedCustomerSearch ? searchedCustomers : customers).filter(
      (customer) => !customer.approvalStatus || customer.approvalStatus === "APPROVED",
    ),
    [customers, searchedCustomers, submittedCustomerSearch],
  );

  const cartQtyByProductId = useMemo(() => {
    const o: Record<string, number> = {};
    for (const line of Object.values(cart)) o[line.productId] = line.qty;
    return o;
  }, [cart]);

  const cartLines = useMemo(() => Object.values(cart), [cart]);
  const cartTotal = useMemo(
    () => cartLines.reduce((s, l) => s + cartLineTotal(l), 0),
    [cartLines],
  );

  const { data: creditInfo, isFetching: creditLoading } = useQuery({
    queryKey: ["seller", "customer-credit", customerId ?? "", cartTotal],
    queryFn: () =>
      apiFetch<CreditOverview>(
        `/seller/customers/${customerId}/credit?previewAmount=${encodeURIComponent(String(cartTotal))}`,
      ),
    enabled: !!customerId,
  });

  const creditBlockedCheckout =
    !!customerId && creditInfo?.effectiveAction === "BLOCK";

  const canAccessProducts = !!customerId;
  const canFinalize =
    !!customerId &&
    !!paymentConditionId &&
    cartLines.length > 0 &&
    !creditBlockedCheckout;
  const canAccessFinalize = !!customerId && cartLines.length > 0;

  const bumpQty = useCallback(
    (p: SaleProduct, delta: number): boolean => {
      if (!customerId) {
        setErr("Selecione um cliente antes de adicionar produtos.");
        setTab("clientes");
        return false;
      }
      const currentQty = cart[p.id]?.qty ?? 0;
      const blockMsg = getProductStockBlockMessage(p, currentQty, delta);
      if (blockMsg) {
        setErr(blockMsg);
        void alert({
          title: "Sem estoque",
          description: blockMsg,
          tone: "danger",
        });
        return false;
      }
      setErr(null);
      setCart((prev) => bumpCartQty(prev, p, delta));
      return true;
    },
    [alert, cart, customerId],
  );

  const scheduleProductTap = useCallback(
    (p: SaleProduct) => {
      if (!customerId) {
        setErr("Selecione um cliente antes de adicionar produtos.");
        setTab("clientes");
        return;
      }
      const id = p.id;
      const timers = productTapTimers.current;
      const pending = timers.get(id);
      if (pending !== undefined) {
        clearTimeout(pending);
        timers.delete(id);
        bumpQty(p, 2);
        return;
      }
      const t = setTimeout(() => {
        timers.delete(id);
        bumpQty(p, 1);
      }, PRODUCT_DOUBLE_TAP_MS);
      timers.set(id, t);
    },
    [bumpQty, customerId],
  );

  const cycleDiscount = useCallback((productId: string) => {
    setCart((prev) => cycleCartLineDiscount(prev, productId));
  }, []);

  const onBarcode = useCallback(
    (raw: string) => {
      if (!customerId) {
        setBarcodeOpen(false);
        setErr("Selecione um cliente antes de adicionar produtos.");
        setTab("clientes");
        return;
      }
      const codeLabel = raw.trim() || "(vazio)";
      const p = findProductByBarcode(products, raw);
      setBarcodeOpen(false);
      if (p && typeof p.effectiveUnitPrice === "number") {
        const added = bumpQty(p, 1);
        if (added) {
          setScanMsgOk(true);
          setScanMsg(`Produto adicionado: ${p.name}`);
        } else {
          setScanMsgOk(false);
          setScanMsg(
            getProductStockBlockMessage(p, cart[p.id]?.qty ?? 0, 1) ??
              `Não foi possível adicionar ${p.name}.`,
          );
        }
      } else {
        setScanMsgOk(false);
        setScanMsg(`Não existe produto com o código ${codeLabel} no sistema.`);
      }
    },
    [cart, products, bumpQty, customerId],
  );

  const cartProductStub = useCallback(
    (line: CartLine): SaleProduct => {
      const fromCatalog = products.find((p) => p.id === line.productId);
      return {
        id: line.productId,
        name: line.name,
        sku: line.sku ?? fromCatalog?.sku,
        effectiveUnitPrice: line.effectiveUnitPrice,
        catalogUnitPrice: line.catalogUnitPrice,
        promotionLabel: line.promotionLabel,
        basePrice: null,
        maxSellerDiscountPercentEffective: line.maxSellerDiscountPercent,
        stockQty: fromCatalog?.stockQty,
        blockSaleWhenOutOfStock: fromCatalog?.blockSaleWhenOutOfStock,
      };
    },
    [products],
  );

  const create = useMutation({
    mutationFn: async (): Promise<SubmitSaleResult> => {
      const lines = Object.values(cart);
      if (!customerId) throw new Error("Selecione o cliente do pedido.");
      if (!paymentConditionId) {
        throw new Error("Selecione a condição de pagamento.");
      }
      if (!lines.length) throw new Error("Adicione pelo menos um produto");
      const clientMutationId = Crypto.randomUUID();
      const payload = {
        customerId,
        paymentConditionId,
        operation: "SALE" as const,
        status: "CONFIRMED" as const,
        ...(canPickSeller ? { sellerId: apiAssignedSellerId ?? null } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.qty,
          ...(l.discountPercent > 0
            ? { discountPercent: l.discountPercent }
            : {}),
        })),
        clientMutationId,
      };

      const buildSnapshot = () => {
        const customerLabel =
          selectedCustomer?.tradeName ||
          selectedCustomer?.name ||
          customers.find((c) => c.id === customerId)?.name;
        return {
          customerLabel,
          paymentConditionLabel: selectedPaymentCondition
            ? `${selectedPaymentCondition.code} - ${selectedPaymentCondition.name}`
            : undefined,
          lineSummaries: lines.map(
            (l) => `${l.name} × ${l.qty} · R$ ${fmtMoney(cartLineTotal(l))}`,
          ),
          cartTotalApprox: cartTotal,
        };
      };

      const enqueueLocal = async () => {
        const ok = await enqueueOfflineSale({
          ...payload,
          snapshot: buildSnapshot(),
        });
        if (!ok) {
          throw new Error(
            "Armazenamento local indisponível. Offline está disponível na app iOS/Android com SQLite.",
          );
        }
        return { mode: "offlineQueued" as const };
      };

      if (orderSyncMode === "MANUAL") {
        return enqueueLocal();
      }

      const result = await postSellerSale(payload);
      if (result.kind === "success")
        return { mode: "online", status: result.status };
      if (result.kind === "dead") throw new Error(result.reason);
      if (result.kind === "auth") throw new Error(result.reason);

      return enqueueLocal();
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["seller", "sales"] });
      void qc.invalidateQueries({ queryKey: ["seller", "products"] });
      void qc.invalidateQueries({
        queryKey: ["seller", "commission-dashboard"],
      });
      void qc.invalidateQueries({ queryKey: ["seller", "customer-credit"] });
      if (data.mode === "offlineQueued") {
        void alert({
          title:
            orderSyncMode === "MANUAL"
              ? "Pedido na fila"
              : "Pedido na fila offline",
          description:
            orderSyncMode === "MANUAL"
              ? "Envio manual ativo: toque em Sincronizar na fila de pedidos para enviar ao servidor."
              : "Assim que houver internet, enviamos automaticamente. Veja em Início → Fila offline.",
        }).then(() => router.back());
        setCart({});
        return;
      }
      if (data.status === "PENDING_CREDIT_APPROVAL") {
        void alert({
          title: "Aguardando aprovação",
          description:
            "O escritório precisa liberar este pedido por causa do crédito do cliente.",
        }).then(() => router.back());
        return;
      }
      showToast({
        message: "Venda realizada com sucesso!",
        tone: "success",
      });
      router.back();
    },
  });

  const finalize = useCallback(() => {
    setErr(null);
    if (!customerId) {
      setErr("Selecione o cliente do pedido.");
      setTab("clientes");
      return;
    }
    if (!paymentConditionId) {
      setErr("Selecione a condição de pagamento.");
      setTab("clientes");
      return;
    }
    if (cartLines.length === 0) {
      setErr("Adicione produtos ao pedido.");
      setTab("produtos");
      return;
    }
    const stockMsg = getCartStockBlockMessage(cartLines, products);
    if (stockMsg) {
      setErr(stockMsg);
      void alert({
        title: "Sem estoque",
        description: stockMsg,
        tone: "danger",
      });
      setTab("produtos");
      return;
    }
    create.mutate(undefined, {
      onError: (e) => {
        const msg = e instanceof Error ? e.message : "Erro";
        setErr(msg);
        void alert({
          title: "Não foi possível finalizar",
          description: msg,
          tone: "danger",
        });
      },
    });
  }, [
    alert,
    cartLines,
    create,
    customerId,
    paymentConditionId,
    products,
    notes,
  ]);

  const openCustomerCredit = useCallback(() => {
    if (customerId) router.push(`/customer/${customerId}`);
  }, [customerId, router]);

  const clearScanMsg = useCallback(() => {
    setScanMsg(null);
    setScanMsgOk(false);
  }, []);

  const selectCustomer = useCallback(
    (id: string) => {
      setCustomerId(id);
      setErr(null);
    },
    [setCustomerId],
  );

  const clearCustomer = useCallback(() => {
    setCustomerId(undefined);
    setCart({});
    setCustomerSearch({
      code: "",
      document: "",
      legalName: "",
      tradeName: "",
      city: "",
    });
    setSubmittedCustomerSearch(null);
  }, [setCustomerId]);

  const searchCustomers = useCallback(() => {
    setSubmittedCustomerSearch({ ...customerSearch });
  }, [customerSearch]);

  const goTab = useCallback(
    (next: QuickSaleTab) => {
      if (next !== "clientes" && !customerId) {
        setErr("Selecione um cliente para continuar.");
        setTab("clientes");
        return;
      }
      if (next === "finalizar" && cartLines.length === 0) {
        setErr("Adicione pelo menos um produto para continuar.");
        setTab("produtos");
        return;
      }
      if (next === "finalizar" && !paymentConditionId) {
        setErr("Selecione a condição de pagamento.");
        setTab("clientes");
        return;
      }
      setErr(null);
      setTab(next);
    },
    [cartLines.length, customerId, paymentConditionId],
  );

  const emptyCatalogMessage =
    products.length === 0
      ? !isOnline
        ? "Sem catálogo em cache. Liga a internet uma vez para sincronizar."
        : "Nenhum produto liberado pelo admin."
      : "Nenhum resultado para esta pesquisa ou categoria.";

  return {
    insets,
    layout,
    tab,
    goTab,
    customerId,
    setCustomerId,
    selectedCustomer,
    formatDoc,
    customers,
    customersLoading,
    customerSearchLoading,
    customerSearchError,
    filteredCustomers,
    customerSearch,
    setCustomerSearch,
    searchCustomers,
    selectCustomer,
    clearCustomer,
    lastCustomerEntity,
    paymentConditions,
    paymentConditionId,
    setPaymentConditionId,
    selectedPaymentCondition,
    paymentPickerOpen,
    setPaymentPickerOpen,
    canPickSeller,
    saleSellers,
    assignedSellerId,
    setAssignedSellerId,
    assignedSellerLabel,
    sellerPickerOpen,
    setSellerPickerOpen,
    notes,
    setNotes,
    catalog,
    cartLines,
    cartTotal,
    cartQtyByProductId,
    creditInfo,
    creditLoading,
    creditBlockedCheckout,
    canAccessProducts,
    canAccessFinalize,
    canFinalize,
    bumpQty,
    scheduleProductTap,
    cycleDiscount,
    cartProductStub,
    cartLineTotal,
    barcodeOpen,
    setBarcodeOpen,
    scanMsg,
    scanMsgOk,
    clearScanMsg,
    onBarcode,
    err,
    create,
    finalize,
    openCustomerCredit,
    emptyCatalogMessage,
  };
}
