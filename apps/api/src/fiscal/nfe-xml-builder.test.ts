import type {
  FiscalInvoice,
  FiscalInvoiceItem,
  Establishment,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildSignedNfePackage } from "./nfe-xml-builder.js";

function stubConfig(): Establishment {
  return {
    id: "cfg",
    organizationId: "org",
    legalName: "Empresa Teste LTDA",
    tradeName: "Empresa Teste",
    cnpj: "11222333000181",
    stateRegistration: "123",
    municipalRegistration: null,
    taxRegime: "SIMPLES_NACIONAL",
    uf: "SP",
    cityIbge: "3550308",
    street: "Rua A",
    addressNumber: "1",
    complement: null,
    district: "Centro",
    city: "São Paulo",
    zipCode: "01001000",
    nfeEnvironment: "HOMOLOGATION",
    nfeSeries: 1,
    nfeLastNumber: 0,
    nfceSeries: null,
    nfceLastNumber: null,
    contingencyEnabled: false,
    nfeContingencyState: "NORMAL",
    nfeContingencySince: null,
    nfeContingencyCheckedAt: null,
    nfeAdditionalInfo: null,
    certificatePfxEncrypted: null,
    certificatePasswordEncrypted: null,
    certificateExpiresAt: null,
    certificateCnpj: null,
    certificateLastAlertThreshold: null,
    autoStockOnInboundInvoice: false,
    danfeLogoBytes: null,
    danfeLogoMimeType: null,
    isPrimary: true,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("buildSignedNfePackage prod", () => {
  it("emite GTIN, CEST e omite EXTIPI zerado", () => {
    const item = {
      id: "i1",
      fiscalInvoiceId: "n1",
      productId: "p1",
      lineNumber: 1,
      description: "PIMENTINHA SALTBITS FD COM 20 UNI",
      ncm: "19053100",
      cfop: "5102",
      unit: "FD",
      quantity: 1,
      unitPrice: 56,
      totalPrice: 56,
      supplierProductCode: null,
      taxSnapshot: {
        orig: 0,
        csosn: "102",
        cProd: "001",
        gtin: "7897750310021",
        cest: "17.005.00",
        ncmException: "0",
        base: 56,
        icms: 0,
        pis: 0,
        cofins: 0,
      },
      createdAt: new Date(),
    } as unknown as FiscalInvoiceItem;

    const invoice = {
      id: "n1",
      organizationId: "org",
      direction: "OUTBOUND",
      status: "DRAFT",
      documentModel: 55,
      tpEmis: "1",
      contingencyJustification: null,
      modFrete: "9",
      freightAmount: null,
      volumeQty: null,
      grossWeightKg: null,
      netWeightKg: null,
      orderId: null,
      supplierId: null,
      customerId: null,
      number: 1,
      series: 1,
      accessKey: null,
      totalAmount: 56,
      issuedAt: null,
      xmlSigned: null,
      xmlAuthorized: null,
      protocol: null,
      rejectionReason: null,
      issuerSnapshot: null,
      recipientSnapshot: null,
      stockApplied: false,
      manifestationType: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [item],
    } as unknown as FiscalInvoice & { items: FiscalInvoiceItem[] };

    const { infNFeXml } = buildSignedNfePackage({
      config: stubConfig(),
      invoice,
      recipient: {
        name: "Cliente",
        document: "11444777000161",
        street: "Av. Paulista",
        addressNumber: "1000",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        zipCode: "01310100",
        cityIbge: "3550308",
      },
      emitterName: "Empresa Demo",
      accessKey: "35100111222333000181550010000000011123456789",
    });

    expect(infNFeXml).toContain("<cProd>001</cProd>");
    expect(infNFeXml).toContain("<cEAN>7897750310021</cEAN>");
    expect(infNFeXml).toContain("<cEANTrib>7897750310021</cEANTrib>");
    expect(infNFeXml).toContain("<CEST>1700500</CEST>");
    expect(infNFeXml).not.toContain("<EXTIPI>");
    expect(infNFeXml).not.toContain("<cEAN>SEM GTIN</cEAN>");
    expect(infNFeXml).toMatch(/<infNFe Id="NFe/);
    expect(infNFeXml).not.toMatch(/<infNFe[^>]*xmlns=/);
    expect(infNFeXml).toContain("<natOp>VENDA DE MERCADORIA</natOp>");
  });

  it("usa a natureza informada no natOp", () => {
    const item = {
      id: "i1",
      fiscalInvoiceId: "n1",
      productId: "p1",
      lineNumber: 1,
      description: "Item",
      ncm: "19053100",
      cfop: "5102",
      unit: "UN",
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      supplierProductCode: null,
      taxSnapshot: { orig: 0, csosn: "102" },
      createdAt: new Date(),
    } as unknown as FiscalInvoiceItem;

    const invoice = {
      id: "n1",
      organizationId: "org",
      direction: "OUTBOUND",
      status: "DRAFT",
      documentModel: 55,
      tpEmis: "1",
      contingencyJustification: null,
      modFrete: "9",
      freightAmount: null,
      volumeQty: null,
      grossWeightKg: null,
      netWeightKg: null,
      orderId: null,
      supplierId: null,
      customerId: null,
      number: 1,
      series: 1,
      accessKey: null,
      totalAmount: 10,
      issuedAt: null,
      xmlSigned: null,
      xmlAuthorized: null,
      protocol: null,
      rejectionReason: null,
      issuerSnapshot: null,
      recipientSnapshot: null,
      stockApplied: false,
      manifestationType: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [item],
    } as unknown as FiscalInvoice & { items: FiscalInvoiceItem[] };

    const { infNFeXml } = buildSignedNfePackage({
      config: stubConfig(),
      invoice,
      recipient: {
        name: "Cliente",
        document: "11444777000161",
        street: "Av. Paulista",
        addressNumber: "1000",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        zipCode: "01310100",
        cityIbge: "3550308",
      },
      emitterName: "Empresa Demo",
      accessKey: "35100111222333000181550010000000011123456789",
      nature: "Venda de mercadoria",
    });

    expect(infNFeXml).toContain("<natOp>Venda de mercadoria</natOp>");
  });

  it("inclui dhCont e xJust quando tpEmis é SVC", () => {
    const item = {
      id: "i1",
      fiscalInvoiceId: "n1",
      productId: "p1",
      lineNumber: 1,
      description: "Item",
      ncm: "19053100",
      cfop: "5102",
      unit: "UN",
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      supplierProductCode: null,
      taxSnapshot: { orig: 0, csosn: "102" },
      createdAt: new Date(),
    } as unknown as FiscalInvoiceItem;

    const invoice = {
      id: "n1",
      organizationId: "org",
      direction: "OUTBOUND",
      status: "DRAFT",
      documentModel: 55,
      tpEmis: "6",
      contingencyJustification:
        "SEFAZ autorizadora indisponivel - emissao em SVC",
      modFrete: "9",
      freightAmount: null,
      volumeQty: null,
      grossWeightKg: null,
      netWeightKg: null,
      orderId: null,
      supplierId: null,
      customerId: null,
      number: 1,
      series: 1,
      accessKey: null,
      totalAmount: 10,
      issuedAt: null,
      xmlSigned: null,
      xmlAuthorized: null,
      protocol: null,
      rejectionReason: null,
      issuerSnapshot: null,
      recipientSnapshot: null,
      stockApplied: false,
      manifestationType: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [item],
    } as unknown as FiscalInvoice & { items: FiscalInvoiceItem[] };

    const issuedAt = new Date("2026-03-15T12:00:00-03:00");
    const { infNFeXml, accessKey } = buildSignedNfePackage({
      config: stubConfig(),
      invoice,
      recipient: {
        name: "Cliente",
        document: "11444777000161",
        street: "Av. Paulista",
        addressNumber: "1000",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        zipCode: "01310100",
        cityIbge: "3550308",
      },
      emitterName: "Empresa Demo",
      issuedAt,
    });

    expect(infNFeXml).toContain("<tpEmis>6</tpEmis>");
    expect(infNFeXml).toContain("<dhCont>");
    expect(infNFeXml).toContain(
      "<xJust>SEFAZ autorizadora indisponivel - emissao em SVC</xJust>",
    );
    expect(accessKey[34]).toBe("6");
  });

  it("não inclui dhCont/xJust em emissão normal", () => {
    const item = {
      id: "i1",
      fiscalInvoiceId: "n1",
      productId: "p1",
      lineNumber: 1,
      description: "Item",
      ncm: "19053100",
      cfop: "5102",
      unit: "UN",
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      supplierProductCode: null,
      taxSnapshot: { orig: 0, csosn: "102" },
      createdAt: new Date(),
    } as unknown as FiscalInvoiceItem;

    const invoice = {
      id: "n1",
      organizationId: "org",
      direction: "OUTBOUND",
      status: "DRAFT",
      documentModel: 55,
      tpEmis: "1",
      contingencyJustification: null,
      modFrete: "9",
      freightAmount: null,
      volumeQty: null,
      grossWeightKg: null,
      netWeightKg: null,
      orderId: null,
      supplierId: null,
      customerId: null,
      number: 1,
      series: 1,
      accessKey: null,
      totalAmount: 10,
      issuedAt: null,
      xmlSigned: null,
      xmlAuthorized: null,
      protocol: null,
      rejectionReason: null,
      issuerSnapshot: null,
      recipientSnapshot: null,
      stockApplied: false,
      manifestationType: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [item],
    } as unknown as FiscalInvoice & { items: FiscalInvoiceItem[] };

    const { infNFeXml } = buildSignedNfePackage({
      config: stubConfig(),
      invoice,
      recipient: {
        name: "Cliente",
        document: "11444777000161",
        street: "Av. Paulista",
        addressNumber: "1000",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        zipCode: "01310100",
        cityIbge: "3550308",
      },
      emitterName: "Empresa Demo",
      accessKey: "35100111222333000181550010000000011123456789",
    });

    expect(infNFeXml).toContain("<tpEmis>1</tpEmis>");
    expect(infNFeXml).not.toContain("<dhCont>");
    expect(infNFeXml).not.toContain("<xJust>");
  });

  it("CNPJ com IE no snapshot `ie` vira indIEDest 1 (não 696)", () => {
    const item = {
      id: "i1",
      fiscalInvoiceId: "n1",
      productId: "p1",
      lineNumber: 1,
      description: "Item",
      ncm: "19053100",
      cfop: "5102",
      unit: "UN",
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      supplierProductCode: null,
      taxSnapshot: { orig: 0, csosn: "102" },
      createdAt: new Date(),
    } as unknown as FiscalInvoiceItem;
    const invoice = {
      id: "n1",
      organizationId: "org",
      direction: "OUTBOUND",
      status: "DRAFT",
      documentModel: 55,
      tpEmis: "1",
      number: 1,
      series: 3,
      items: [item],
    } as unknown as FiscalInvoice & { items: FiscalInvoiceItem[] };

    const { infNFeXml } = buildSignedNfePackage({
      config: stubConfig(),
      invoice,
      recipient: {
        name: "Cliente BA",
        document: "11444777000161",
        ie: "204.706.939",
        street: "Rua A",
        addressNumber: "1",
        district: "Centro",
        city: "Salvador",
        state: "BA",
        zipCode: "40000000",
        cityIbge: "2927408",
      },
      emitterName: "Empresa Demo",
    });

    expect(infNFeXml).toContain("<indIEDest>1</indIEDest>");
    expect(infNFeXml).toContain("<IE>204706939</IE>");
    expect(infNFeXml).toContain("<indFinal>0</indFinal>");
  });

  it("Bahia inclui autXML da SEFAZ-BA (486)", () => {
    const item = {
      id: "i1",
      fiscalInvoiceId: "n1",
      productId: "p1",
      lineNumber: 1,
      description: "Item",
      ncm: "19053100",
      cfop: "5102",
      unit: "UN",
      quantity: 1,
      unitPrice: 10,
      totalPrice: 10,
      supplierProductCode: null,
      taxSnapshot: { orig: 0, csosn: "102" },
      createdAt: new Date(),
    } as unknown as FiscalInvoiceItem;
    const invoice = {
      id: "n1",
      organizationId: "org",
      direction: "OUTBOUND",
      status: "DRAFT",
      documentModel: 55,
      tpEmis: "1",
      number: 1,
      series: 1,
      items: [item],
    } as unknown as FiscalInvoice & { items: FiscalInvoiceItem[] };

    const ba = { ...stubConfig(), uf: "BA", cityIbge: "2927408", city: "Salvador" };
    const { infNFeXml } = buildSignedNfePackage({
      config: ba,
      invoice,
      recipient: {
        name: "Cliente",
        document: "11444777000161",
        ie: "12345678",
        street: "Rua A",
        addressNumber: "1",
        district: "Centro",
        city: "Salvador",
        state: "BA",
        zipCode: "40000000",
        cityIbge: "2927408",
      },
      emitterName: "Empresa Demo",
    });

    expect(infNFeXml).toContain("<autXML>");
    expect(infNFeXml).toContain("<CNPJ>13937073000156</CNPJ>");
  });
});
