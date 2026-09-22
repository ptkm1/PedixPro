import {
    KeyboardAvoidingScreen,
    MobileHeader,
    SafeScreen,
} from "@/components/layout";
import { AppToast } from "@/components/molecules/AppToast";
import { CatalogFiltersModal } from "@/components/molecules/CatalogFiltersModal";
import { CatalogViewModeToggle } from "@/components/molecules/CatalogViewModeToggle";
import { CATALOG_SEARCH_PLACEHOLDER } from "@/lib/catalog-search";
import type { QuickSaleTab } from "@/lib/sale/types";
import { formatCustomerCode } from "@pedidos/shared";
import {
    ChevronDown,
    ChevronUp,
    ClipboardCheck,
    Minus,
    Plus,
    ScanBarcode,
    Search,
    ShoppingCart,
    SlidersHorizontal,
    X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Modal,
    Pressable,
    ScrollView,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { BarcodeScannerModal } from "../components/BarcodeScannerModal";
import {
    CollapsibleCatalogSection,
    ProductCatalogTile,
} from "../components/ProductCatalogViews";
import { ThemedTextInput } from "../components/atoms/ThemedTextInput";
import { fmtMoney } from "../components/atoms/formatMoney";
import { useQuickSaleScreen } from "../hooks/screens/useQuickSaleScreen";
import { useCatalogViewMode } from "../hooks/useCatalogViewMode";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { SaleProduct } from "../lib/sale/types";
import { useTheme } from "../lib/theme";
import { createQuickSaleStyles } from "@/styles/quick-sale.styles";

const TABS: { id: QuickSaleTab; label: string }[] = [
  { id: "clientes", label: "Clientes" },
  { id: "produtos", label: "Produtos" },
  { id: "finalizar", label: "Finalizar" },
];

export default function QuickSaleScreen() {
  const styles = useThemedStyles(createQuickSaleStyles);
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { viewMode, toggleViewMode } = useCatalogViewMode();
  const s = useQuickSaleScreen();
  const { catalog, layout } = s;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [activeSearchField, setActiveSearchField] = useState<string | null>(
    null,
  );

  const confirmCustomerSearch = (field: string) => {
    Keyboard.dismiss();
    setActiveSearchField(field);
    s.searchCustomers();
  };

  const cartExpandedMaxH = Math.min(windowHeight * 0.4, 280);
  const hasCart = s.cartLines.length > 0;
  const filterActive =
    catalog.categoryFilterIds.length > 0 ||
    catalog.supplierFilterIds.length > 0;

  useEffect(() => {
    if (!hasCart) setCartExpanded(false);
  }, [hasCart]);

  useEffect(() => {
    if (!s.customerSearchLoading) setActiveSearchField(null);
  }, [s.customerSearchLoading]);

  const footerHeight = useMemo(() => {
    const padBottom = Math.max(s.insets.bottom, 12);
    let h = 10 + padBottom + 56;
    if (s.err || s.creditBlockedCheckout) h += 28;
    if (hasCart && s.tab === "produtos") h += 52;
    if (hasCart && cartExpanded && s.tab === "produtos")
      h += cartExpandedMaxH + 8;
    return h;
  }, [
    s.insets.bottom,
    s.err,
    s.creditBlockedCheckout,
    hasCart,
    cartExpanded,
    cartExpandedMaxH,
    s.tab,
  ]);

  const toastBottom = footerHeight + 8;

  const tabBar = (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const active = s.tab === t.id;
        const locked =
          t.id !== "clientes" && !s.customerId
            ? true
            : t.id === "finalizar" && !s.canAccessFinalize;
        return (
          <Pressable
            key={t.id}
            style={[styles.tabItem, active && styles.tabItemActive]}
            onPress={() => s.goTab(t.id)}
            accessibilityState={{ selected: active, disabled: locked }}
          >
            <Text
              style={[
                styles.tabLabel,
                active && styles.tabLabelActive,
                locked && styles.tabLabelLocked,
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const creditBlock =
    s.customerId && s.creditInfo ? (
      <View
        style={[
          styles.creditBanner,
          s.creditInfo.effectiveAction === "BLOCK"
            ? styles.creditBannerDanger
            : styles.creditBannerWarn,
        ]}
      >
        <Text style={styles.creditBannerTitle}>Situação de crédito</Text>
        {s.creditInfo.creditBlocked ? (
          <Text style={styles.creditBannerTxt}>
            • Cliente bloqueado pelo escritório.
          </Text>
        ) : null}
        <Text style={styles.creditBannerTxt}>
          • Em aberto: R$ {fmtMoney(s.creditInfo.openBalance)}
          {s.creditInfo.creditLimit != null
            ? ` · Limite R$ ${fmtMoney(s.creditInfo.creditLimit)}`
            : ""}
        </Text>
        {s.creditInfo.overdueCount > 0 ? (
          <Text style={styles.creditBannerTxt}>
            • {s.creditInfo.overdueCount} título(s) vencido(s) · R${" "}
            {fmtMoney(s.creditInfo.overdueAmount)}
          </Text>
        ) : null}
        {s.creditInfo.violations.map((v, i) => (
          <Text key={`${v.code}-${i}`} style={styles.creditBannerTxt}>
            • {v.message}
          </Text>
        ))}
        {s.creditInfo.effectiveAction === "BLOCK" ? (
          <Text style={styles.creditBannerBold}>
            Não é possível confirmar este pedido.
          </Text>
        ) : s.creditInfo.effectiveAction === "APPROVAL" &&
          s.creditInfo.violations.length > 0 ? (
          <Text style={styles.creditBannerBold}>
            Este pedido pode ser enviado para aprovação no escritório.
          </Text>
        ) : null}
      </View>
    ) : s.creditLoading && s.customerId ? (
      <ActivityIndicator
        style={{ marginVertical: 10 }}
        color={colors.primary}
      />
    ) : null;

  const clientesTab = (
    <ScrollView
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
    >
      {!s.selectedCustomer ? (
        <>
          <Text style={styles.sectionTitle}>Identificar cliente</Text>
          <Text style={styles.microHint}>
            A venda só pode ser iniciada após selecionar um cliente.
          </Text>
          <View style={styles.formGrid}>
            <View style={styles.formFieldHalf}>
              <Text style={styles.fieldLabel}>Código / busca</Text>
              <View style={styles.customerSearchField}>
                <ThemedTextInput
                  style={styles.customerSearchInput}
                  value={s.customerSearch.code}
                  onChangeText={(code) =>
                    s.setCustomerSearch((prev) => ({ ...prev, code }))
                  }
                  onSubmitEditing={() => confirmCustomerSearch("code")}
                  returnKeyType="search"
                  placeholder="Código ou nome"
                  autoCapitalize="none"
                />
                <Pressable
                  style={styles.customerSearchBtn}
                  onPress={() => confirmCustomerSearch("code")}
                  accessibilityRole="button"
                  accessibilityLabel="Pesquisar por código ou nome"
                >
                  {s.customerSearchLoading && activeSearchField === "code" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Search size={20} color={colors.primary} strokeWidth={2.4} />
                  )}
                </Pressable>
              </View>
            </View>
            <View style={styles.formFieldHalf}>
              <Text style={styles.fieldLabel}>CNPJ / CPF</Text>
              <View style={styles.customerSearchField}>
                <ThemedTextInput
                  style={styles.customerSearchInput}
                  value={s.customerSearch.document}
                  onChangeText={(document) =>
                    s.setCustomerSearch((prev) => ({ ...prev, document }))
                  }
                  placeholder="00.000.000/0000-00"
                  keyboardType="number-pad"
                />
                <Pressable
                  style={styles.customerSearchBtn}
                  onPress={() => confirmCustomerSearch("document")}
                  accessibilityRole="button"
                  accessibilityLabel="Pesquisar por CNPJ ou CPF"
                >
                  {s.customerSearchLoading && activeSearchField === "document" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Search size={20} color={colors.primary} strokeWidth={2.4} />
                  )}
                </Pressable>
              </View>
            </View>
            <View style={styles.formFieldFull}>
              <Text style={styles.fieldLabel}>Razão social</Text>
              <View style={styles.customerSearchField}>
                <ThemedTextInput
                  style={styles.customerSearchInput}
                  value={s.customerSearch.legalName}
                  onChangeText={(legalName) =>
                    s.setCustomerSearch((prev) => ({ ...prev, legalName }))
                  }
                  onSubmitEditing={() => confirmCustomerSearch("legalName")}
                  returnKeyType="search"
                />
                <Pressable
                  style={styles.customerSearchBtn}
                  onPress={() => confirmCustomerSearch("legalName")}
                  accessibilityRole="button"
                  accessibilityLabel="Pesquisar por razão social"
                >
                  {s.customerSearchLoading && activeSearchField === "legalName" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Search size={20} color={colors.primary} strokeWidth={2.4} />
                  )}
                </Pressable>
              </View>
            </View>
            <View style={styles.formFieldFull}>
              <Text style={styles.fieldLabel}>Nome fantasia</Text>
              <View style={styles.customerSearchField}>
                <ThemedTextInput
                  style={styles.customerSearchInput}
                  value={s.customerSearch.tradeName}
                  onChangeText={(tradeName) =>
                    s.setCustomerSearch((prev) => ({ ...prev, tradeName }))
                  }
                  onSubmitEditing={() => confirmCustomerSearch("tradeName")}
                  returnKeyType="search"
                />
                <Pressable
                  style={styles.customerSearchBtn}
                  onPress={() => confirmCustomerSearch("tradeName")}
                  accessibilityRole="button"
                  accessibilityLabel="Pesquisar por nome fantasia"
                >
                  {s.customerSearchLoading && activeSearchField === "tradeName" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Search size={20} color={colors.primary} strokeWidth={2.4} />
                  )}
                </Pressable>
              </View>
            </View>
            <View style={styles.formFieldFull}>
              <Text style={styles.fieldLabel}>Cidade</Text>
              <View style={styles.customerSearchField}>
                <ThemedTextInput
                  style={styles.customerSearchInput}
                  value={s.customerSearch.city}
                  onChangeText={(city) =>
                    s.setCustomerSearch((prev) => ({ ...prev, city }))
                  }
                  onSubmitEditing={() => confirmCustomerSearch("city")}
                  returnKeyType="search"
                />
                <Pressable
                  style={styles.customerSearchBtn}
                  onPress={() => confirmCustomerSearch("city")}
                  accessibilityRole="button"
                  accessibilityLabel="Pesquisar por cidade"
                >
                  {s.customerSearchLoading && activeSearchField === "city" ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Search size={20} color={colors.primary} strokeWidth={2.4} />
                  )}
                </Pressable>
              </View>
            </View>
          </View>

          {s.lastCustomerEntity ? (
            <Pressable
              style={styles.lastCustomerBtn}
              onPress={() => s.selectCustomer(s.lastCustomerEntity!.id)}
            >
              <Text style={styles.lastCustomerTxt}>
                Último:{" "}
                {s.lastCustomerEntity.tradeName || s.lastCustomerEntity.name}
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.subSection}>
            Resultados ({s.filteredCustomers.length})
          </Text>
          {s.customersLoading || s.customerSearchLoading ? (
            <View style={styles.customerSearchLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.customerSearchLoadingTxt}>
                Buscando clientes…
              </Text>
            </View>
          ) : (
            s.filteredCustomers.slice(0, 40).map((c) => (
            <Pressable
              key={c.id}
              style={styles.customerResultRow}
              onPress={() => s.selectCustomer(c.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.customerResultName}>
                  {c.tradeName || c.name}
                </Text>
                <Text style={styles.customerResultMeta}>
                  {s.formatDoc(c)}
                  {c.city ? ` · ${c.city}${c.state ? `/${c.state}` : ""}` : ""}
                </Text>
              </View>
            </Pressable>
            ))
          )}
          {!s.customersLoading &&
          !s.customerSearchLoading &&
          s.filteredCustomers.length === 0 ? (
            <Text style={styles.warn}>Nenhum cliente encontrado.</Text>
          ) : null}
          {s.customerSearchError ? (
            <Text style={styles.warn}>
              {s.customerSearchError instanceof Error
                ? s.customerSearchError.message
                : "Não foi possível pesquisar clientes."}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          {creditBlock}
          <View style={styles.selectedCard}>
            <View style={styles.selectedCardHeader}>
              <Text style={styles.sectionTitle}>Cliente do pedido</Text>
              <Pressable
                onPress={s.clearCustomer}
                hitSlop={10}
                accessibilityLabel="Trocar cliente"
              >
                <X size={22} color={colors.danger} />
              </Pressable>
            </View>
            <View style={styles.formGrid}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Código</Text>
                <Text style={styles.readonlyValue}>
                  {formatCustomerCode(s.selectedCustomer)}
                </Text>
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.fieldLabel}>Documento</Text>
                <Text style={styles.readonlyValue}>
                  {s.formatDoc(s.selectedCustomer)}
                </Text>
              </View>
              <View style={styles.formFieldFull}>
                <Text style={styles.fieldLabel}>Razão social</Text>
                <Text style={styles.readonlyValue}>
                  {s.selectedCustomer.legalName || s.selectedCustomer.name}
                </Text>
              </View>
              <View style={styles.formFieldFull}>
                <Text style={styles.fieldLabel}>Nome fantasia</Text>
                <Text style={styles.readonlyValue}>
                  {s.selectedCustomer.tradeName || s.selectedCustomer.name}
                </Text>
              </View>
              <View style={styles.formFieldFull}>
                <Text style={styles.fieldLabel}>Cidade/UF</Text>
                <Text style={styles.readonlyValue}>
                  {s.selectedCustomer.city
                    ? `${s.selectedCustomer.city}${
                        s.selectedCustomer.state
                          ? `/${s.selectedCustomer.state}`
                          : ""
                      }`
                    : "—"}
                </Text>
              </View>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
              Condição de pagamento
            </Text>
            <Pressable
              style={styles.selectBtn}
              onPress={() => s.setPaymentPickerOpen(true)}
            >
              <Text style={styles.selectBtnTxt} numberOfLines={1}>
                {s.selectedPaymentCondition
                  ? `${s.selectedPaymentCondition.code} - ${s.selectedPaymentCondition.name}`
                  : "Selecione…"}
              </Text>
              <ChevronDown size={18} color={colors.textSecondary} />
            </Pressable>

            {s.canPickSeller ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                  Vendedor responsável
                </Text>
                <Pressable
                  style={styles.selectBtn}
                  onPress={() => s.setSellerPickerOpen(true)}
                >
                  <Text style={styles.selectBtnTxt} numberOfLines={2}>
                    {s.assignedSellerLabel ?? "Venda Direta"}
                  </Text>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </Pressable>
              </>
            ) : null}

            {s.usableTables.length > 0 ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                  Tabela de preço
                </Text>
                <Pressable
                  style={styles.selectBtn}
                  onPress={() => s.setPriceTablePickerOpen(true)}
                >
                  <Text style={styles.selectBtnTxt} numberOfLines={1}>
                    {s.selectedPriceTable
                      ? s.selectedPriceTable.name
                      : "Selecione…"}
                  </Text>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </Pressable>
              </>
            ) : null}

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
              Operação do pedido
            </Text>
            <View style={styles.selectBtn}>
              <Text style={styles.selectBtnTxt}>1 - VENDA</Text>
            </View>

            <Pressable
              style={styles.creditLinkBtn}
              onPress={s.openCustomerCredit}
            >
              <Text style={styles.creditLinkTxt}>
                Mais informações / financeiro
              </Text>
            </Pressable>

            <Pressable
              style={[styles.finalBtn, { marginTop: 12 }]}
              onPress={() => s.goTab("produtos")}
            >
              <Text style={styles.finalTxt}>Continuar para produtos</Text>
            </Pressable>
          </View>
        </>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const productsHeader = (
    <View style={styles.headerBlock}>
      {s.selectedCustomer ? (
        <Text style={styles.customerChip}>
          {s.selectedCustomer.tradeName || s.selectedCustomer.name}
          {s.selectedPaymentCondition
            ? ` · ${s.selectedPaymentCondition.name}`
            : ""}
          {s.selectedPriceTable ? ` · ${s.selectedPriceTable.name}` : ""}
        </Text>
      ) : null}
      <Text style={styles.sectionTitle}>Catálogo</Text>
      <View style={styles.searchRow}>
        <Search size={18} color={colors.iconMuted} style={styles.searchIcon} />
        <ThemedTextInput
          style={styles.searchInput}
          placeholder={CATALOG_SEARCH_PLACEHOLDER}
          value={catalog.productQuery}
          onChangeText={catalog.setProductQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Pressable
          style={styles.filterBtn}
          onPress={() => setFiltersOpen(true)}
          accessibilityLabel="Filtros"
        >
          <SlidersHorizontal
            size={20}
            color={colors.primary}
            strokeWidth={2.2}
          />
          {filterActive ? <View style={styles.filterBadge} /> : null}
        </Pressable>
        <Pressable
          style={styles.scanBtn}
          onPress={() => s.setBarcodeOpen(true)}
        >
          <ScanBarcode
            size={22}
            color={colors.primaryForeground}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>

      <CollapsibleCatalogSection
        title="Mais vendidos"
        products={catalog.topSellingProducts}
        viewMode={viewMode}
        tileWidth={layout.tileW}
        listTileWidth={layout.listTileW}
        catalogGap={layout.catalogGap}
        favoriteIds={catalog.favoriteIds}
        onToggleFavorite={catalog.toggleFavorite}
        onProductPress={(p) => s.scheduleProductTap(p as SaleProduct)}
        qtyByProductId={s.cartQtyByProductId}
      />

      <CollapsibleCatalogSection
        title="Favoritos"
        products={catalog.favoriteProductsList}
        viewMode={viewMode}
        tileWidth={layout.tileW}
        listTileWidth={layout.listTileW}
        catalogGap={layout.catalogGap}
        favoriteIds={catalog.favoriteIds}
        onToggleFavorite={catalog.toggleFavorite}
        onProductPress={(p) => s.scheduleProductTap(p as SaleProduct)}
        qtyByProductId={s.cartQtyByProductId}
      />

      <Text style={styles.subSection}>
        Todos ({catalog.filteredProducts.length})
      </Text>
    </View>
  );

  const finalizarTab = (
    <ScrollView
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Resumo do pedido</Text>
      {s.selectedCustomer ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLine}>
            Cliente:{" "}
            <Text style={styles.summaryStrong}>
              {s.selectedCustomer.tradeName || s.selectedCustomer.name}
            </Text>
          </Text>
          <Text style={styles.summaryLine}>
            Documento: {s.formatDoc(s.selectedCustomer)}
          </Text>
          <Text style={styles.summaryLine}>
            Pagamento:{" "}
            {s.selectedPaymentCondition
              ? `${s.selectedPaymentCondition.code} - ${s.selectedPaymentCondition.name}`
              : "—"}
          </Text>
          {s.selectedPriceTable ? (
            <Text style={styles.summaryLine}>
              Tabela: {s.selectedPriceTable.name}
            </Text>
          ) : null}
          <Text style={styles.summaryLine}>Operação: 1 - VENDA</Text>
        </View>
      ) : null}
      {creditBlock}
      {s.cartLines.length === 0 ? (
        <Text style={styles.warn}>Nenhum produto no carrinho.</Text>
      ) : (
        s.cartLines.map((line) => (
          <View key={line.productId} style={styles.cartRow}>
            <View style={styles.cartMain}>
              <Text style={styles.cartName}>{line.name}</Text>
              <Text style={styles.cartMeta}>
                {line.qty} × R$ {fmtMoney(line.effectiveUnitPrice)}
                {line.discountPercent > 0 ? ` · −${line.discountPercent}%` : ""}
              </Text>
              {line.priceOriginLabel ? (
                <Text style={styles.cartMeta}>{line.priceOriginLabel}</Text>
              ) : null}
            </View>
            <Text style={styles.cartSummaryMeta}>
              R$ {fmtMoney(s.cartLineTotal(line))}
            </Text>
          </View>
        ))
      )}
      <Text style={styles.cartTotal}>Total R$ {fmtMoney(s.cartTotal)}</Text>
      <View style={styles.notesField}>
        <Text style={styles.fieldLabel}>Observação (opcional)</Text>
        <ThemedTextInput
          value={s.notes}
          onChangeText={s.setNotes}
          placeholder="Ex.: entregar pela manhã"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          maxLength={1000}
          style={styles.notesInput}
        />
      </View>
      <View style={{ height: 120 }} />
    </ScrollView>
  );

  return (
    <SafeScreen variant="topOnly">
      <MobileHeader
        title="Digitação de pedidos"
        subtitle={
          s.selectedCustomer
            ? s.selectedCustomer.tradeName || s.selectedCustomer.name
            : "Selecione o cliente"
        }
        showBack
        rightAction={
          s.tab === "produtos" ? (
            <CatalogViewModeToggle
              viewMode={viewMode}
              onToggle={toggleViewMode}
            />
          ) : undefined
        }
      />
      {tabBar}
      <KeyboardAvoidingScreen style={styles.flex} offset={8}>
        {s.tab === "clientes" ? clientesTab : null}

        {s.tab === "produtos" ? (
          <FlatList
            key={viewMode}
            numColumns={viewMode === "list" ? 1 : 2}
            data={catalog.filteredProducts}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={productsHeader}
            ListFooterComponent={<View style={{ height: footerHeight + 16 }} />}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            columnWrapperStyle={
              viewMode === "list"
                ? undefined
                : { gap: layout.catalogGap, marginBottom: layout.catalogGap }
            }
            renderItem={({ item: p }) => (
              <ProductCatalogTile
                variant={viewMode === "list" ? "list" : "grid"}
                tileWidth={
                  viewMode === "list" ? layout.listTileW : layout.tileW
                }
                product={p}
                favorite={catalog.favoriteIds.has(p.id)}
                onToggleFavorite={() => catalog.toggleFavorite(p.id)}
                onAddPress={() => s.scheduleProductTap(p)}
                qtyInCart={s.cartQtyByProductId[p.id]}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.warn}>{s.emptyCatalogMessage}</Text>
            }
          />
        ) : null}

        {s.tab === "finalizar" ? finalizarTab : null}

        <AppToast
          visible={!!s.scanMsg}
          message={s.scanMsg ?? ""}
          tone={s.scanMsgOk ? "success" : "warning"}
          onDismiss={s.clearScanMsg}
          bottomOffset={toastBottom}
        />

        {(s.tab === "produtos" || s.tab === "finalizar") && (
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(s.insets.bottom, 12) },
            ]}
          >
            {hasCart && s.tab === "produtos" ? (
              <>
                <Pressable
                  style={styles.cartSummaryBtn}
                  onPress={() => setCartExpanded((v) => !v)}
                >
                  <ShoppingCart
                    size={18}
                    color={colors.primary}
                    strokeWidth={2.2}
                  />
                  <Text style={styles.cartSummaryText} numberOfLines={1}>
                    Carrinho · {s.cartLines.length}{" "}
                    {s.cartLines.length === 1 ? "item" : "itens"}
                  </Text>
                  <Text style={styles.cartSummaryMeta} numberOfLines={1}>
                    R$ {fmtMoney(s.cartTotal)}
                  </Text>
                  {cartExpanded ? (
                    <ChevronDown size={20} color={colors.textSecondary} />
                  ) : (
                    <ChevronUp size={20} color={colors.textSecondary} />
                  )}
                </Pressable>
                {cartExpanded ? (
                  <View
                    style={[
                      styles.cartExpandedPanel,
                      { maxHeight: cartExpandedMaxH },
                    ]}
                  >
                    <ScrollView
                      style={styles.cartExpandedScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {s.cartLines.map((line) => (
                        <View key={line.productId} style={styles.cartRow}>
                          <View style={styles.cartMain}>
                            <Text style={styles.cartName} numberOfLines={2}>
                              {line.name}
                            </Text>
                            <Text style={styles.cartMeta}>
                              R$ {fmtMoney(line.effectiveUnitPrice)}
                              {line.discountPercent > 0
                                ? ` · −${line.discountPercent}%`
                                : ""}
                              {" · "}Subtotal R${" "}
                              {fmtMoney(s.cartLineTotal(line))}
                            </Text>
                            {line.priceTableName ? (
                              <Text style={styles.cartMeta} numberOfLines={1}>
                                Tabela: {line.priceTableName}
                              </Text>
                            ) : null}
                            {line.priceOriginLabel ? (
                              <Text style={styles.cartMeta}>
                                {line.priceOriginLabel}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.cartActions}>
                            <View style={styles.qtyRow}>
                              <Pressable
                                hitSlop={8}
                                style={styles.iconBtn}
                                onPress={() =>
                                  s.bumpQty(s.cartProductStub(line), -1)
                                }
                              >
                                <Minus
                                  size={20}
                                  color={colors.text}
                                  strokeWidth={2.5}
                                />
                              </Pressable>
                              <Text style={styles.qtyTxt}>{line.qty}</Text>
                              <Pressable
                                hitSlop={8}
                                style={styles.iconBtn}
                                onPress={() =>
                                  s.bumpQty(s.cartProductStub(line), 1)
                                }
                              >
                                <Plus
                                  size={20}
                                  color={colors.text}
                                  strokeWidth={2.5}
                                />
                              </Pressable>
                            </View>
                            <Pressable
                              style={[
                                styles.discBtn,
                                line.maxSellerDiscountPercent <= 0 &&
                                  styles.discBtnDis,
                              ]}
                              disabled={line.maxSellerDiscountPercent <= 0}
                              onPress={() => s.cycleDiscount(line.productId)}
                            >
                              <Text style={styles.discBtnTxt}>
                                {line.maxSellerDiscountPercent <= 0
                                  ? "Sem desc."
                                  : `Desc. ${line.discountPercent}%`}
                              </Text>
                              {line.maxSellerDiscountPercent > 0 ? (
                                <Text style={styles.discBtnHint}>
                                  Máx. {line.maxSellerDiscountPercent}%
                                </Text>
                              ) : null}
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </>
            ) : null}

            {s.err ? <Text style={styles.errFoot}>{s.err}</Text> : null}
            {s.creditBlockedCheckout ? (
              <Text style={styles.errFoot}>
                Pedido bloqueado pela política de crédito.
              </Text>
            ) : null}

            {s.tab === "produtos" ? (
              <Pressable
                style={[
                  styles.finalBtn,
                  (!hasCart || !s.customerId) && styles.finalBtnDis,
                ]}
                disabled={!hasCart || !s.customerId}
                onPress={() => s.goTab("finalizar")}
              >
                <Text style={styles.finalTxt}>
                  Ir para finalizar · R$ {fmtMoney(s.cartTotal)}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.finalBtn,
                  (!s.canFinalize || s.create.isPending) && styles.finalBtnDis,
                ]}
                disabled={!s.canFinalize || s.create.isPending}
                onPress={s.finalize}
              >
                {s.create.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <View style={styles.finalInner}>
                    <ClipboardCheck
                      color={colors.primaryForeground}
                      size={22}
                      strokeWidth={2}
                    />
                    <Text style={styles.finalTxt}>
                      Confirmar pedido · R$ {fmtMoney(s.cartTotal)}
                    </Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        )}

        <BarcodeScannerModal
          visible={s.barcodeOpen}
          onClose={() => s.setBarcodeOpen(false)}
          onBarcode={s.onBarcode}
        />

        <CatalogFiltersModal
          visible={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          categories={catalog.catalogCategories}
          selectedCategoryIds={catalog.categoryFilterIds}
          suppliers={catalog.catalogSuppliers}
          selectedSupplierIds={catalog.supplierFilterIds}
          onApply={({ categoryIds, supplierIds }) => {
            catalog.setCategoryFilterIds(categoryIds);
            catalog.setSupplierFilterIds(supplierIds);
          }}
        />

        <Modal
          visible={s.paymentPickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => s.setPaymentPickerOpen(false)}
        >
          <SafeScreen>
            <MobileHeader
              title="Condição de pagamento"
              showBack
              onBack={() => s.setPaymentPickerOpen(false)}
            />
            <FlatList
              data={s.paymentConditions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 4 }}
              ListEmptyComponent={
                <Text style={styles.warn}>
                  Nenhuma condição cadastrada. Peça ao admin para rodar o seed
                  ou cadastrar condições.
                </Text>
              }
              renderItem={({ item }) => {
                const active = item.id === s.paymentConditionId;
                return (
                  <Pressable
                    style={[
                      styles.paymentRow,
                      active && styles.paymentRowActive,
                    ]}
                    onPress={() => {
                      s.setPaymentConditionId(item.id);
                      s.setPaymentPickerOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.paymentRowTxt,
                        active && styles.paymentRowTxtActive,
                      ]}
                    >
                      {item.code} - {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </SafeScreen>
        </Modal>

        {s.canPickSeller ? (
          <Modal
            visible={s.sellerPickerOpen}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => s.setSellerPickerOpen(false)}
          >
            <SafeScreen>
              <MobileHeader
                title="Vendedor responsável"
                showBack
                onBack={() => s.setSellerPickerOpen(false)}
              />
              <FlatList
                data={[
                  {
                    id: "__direct__",
                    name: "Venda Direta — Sem comissão para vendedor",
                  },
                  ...s.saleSellers,
                ]}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: 16, gap: 4 }}
                renderItem={({ item }) => {
                  const active = item.id === s.assignedSellerId;
                  return (
                    <Pressable
                      style={[
                        styles.paymentRow,
                        active && styles.paymentRowActive,
                      ]}
                      onPress={() => {
                        s.setAssignedSellerId(item.id);
                        s.setSellerPickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.paymentRowTxt,
                          active && styles.paymentRowTxtActive,
                        ]}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </SafeScreen>
          </Modal>
        ) : null}

        <Modal
          visible={Boolean(s.priceTablePicker)}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => s.closePriceTablePicker()}
        >
          <SafeScreen>
            <MobileHeader
              title="Tabela de preço"
              showBack
              onBack={() => s.closePriceTablePicker()}
            />
            {s.priceTablePicker?.product ? (
              <Text style={styles.priceTableProduct} numberOfLines={2}>
                {s.priceTablePicker.product.name}
              </Text>
            ) : null}
            {s.priceTablePicker?.loading ? (
              <View style={styles.priceTableLoading}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.warn}>Carregando tabelas…</Text>
              </View>
            ) : (
              <FlatList
                data={s.priceTablePicker?.options ?? []}
                keyExtractor={(item) => item.priceTableId}
                contentContainerStyle={{ padding: 16, gap: 8 }}
                ListEmptyComponent={
                  <Text style={styles.warn}>
                    Nenhuma tabela disponível para este produto nesta operação.
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.paymentRow, { flexDirection: "row", alignItems: "center" }]}
                    onPress={() => s.confirmPriceTableOption(item)}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.paymentRowTxt}>{item.name}</Text>
                      {item.promotionLabel ? (
                        <Text style={styles.priceTablePromo}>
                          {item.promotionLabel}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.priceTablePrice}>
                      R$ {fmtMoney(item.effectiveUnitPrice)}
                    </Text>
                  </Pressable>
                )}
              />
            )}
          </SafeScreen>
        </Modal>

        <Modal
          visible={s.priceTablePickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => s.setPriceTablePickerOpen(false)}
        >
          <SafeScreen>
            <MobileHeader
              title="Tabela de preço"
              showBack
              onBack={() => s.setPriceTablePickerOpen(false)}
            />
            <FlatList
              data={s.usableTables}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, gap: 4 }}
              ListEmptyComponent={
                <Text style={styles.warn}>
                  Nenhuma tabela de preço disponível para este pedido.
                </Text>
              }
              renderItem={({ item }) => {
                const active = item.id === s.priceTableId;
                return (
                  <Pressable
                    style={[
                      styles.paymentRow,
                      active && styles.paymentRowActive,
                    ]}
                    onPress={() => {
                      void s.requestPriceTableId(item.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.paymentRowTxt,
                        active && styles.paymentRowTxtActive,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </SafeScreen>
        </Modal>
      </KeyboardAvoidingScreen>
    </SafeScreen>
  );
}
