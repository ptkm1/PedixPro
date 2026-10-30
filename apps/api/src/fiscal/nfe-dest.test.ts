import { describe, expect, it } from "vitest";
import { resolveNfeDestIcms } from "./nfe-dest.js";

describe("resolveNfeDestIcms", () => {
  it("CNPJ com IE: contribuinte, não força consumidor final", () => {
    const d = resolveNfeDestIcms({
      document: "13.937.075/0001-56",
      ie: "204.706.939",
    });
    expect(d.indIEDest).toBe("1");
    expect(d.ie).toBe("204706939");
    expect(d.indFinal).toBe("0");
  });

  it("lê IE de stateRegistration (cadastro) e do alias ie (snapshot)", () => {
    expect(
      resolveNfeDestIcms({
        document: "11444777000161",
        stateRegistration: "12345678",
      }).indIEDest,
    ).toBe("1");
    expect(
      resolveNfeDestIcms({
        document: "11444777000161",
        ie: "12345678",
      }).ie,
    ).toBe("12345678");
  });

  it("CNPJ sem IE: não contribuinte e consumidor final (696)", () => {
    const d = resolveNfeDestIcms({ document: "11444777000161" });
    expect(d.indIEDest).toBe("9");
    expect(d.ie).toBeNull();
    expect(d.indFinal).toBe("1");
  });

  it("CPF: não contribuinte e consumidor final", () => {
    const d = resolveNfeDestIcms({ document: "529.982.247-25" });
    expect(d.indIEDest).toBe("9");
    expect(d.indFinal).toBe("1");
  });

  it("ISENTO: indIEDest 2", () => {
    const d = resolveNfeDestIcms({
      document: "11444777000161",
      stateRegistration: "ISENTO",
    });
    expect(d.indIEDest).toBe("2");
    expect(d.ie).toBeNull();
  });
});
