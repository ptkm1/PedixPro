-- Estado da contingência SVC por estabelecimento.

CREATE TYPE "NfeContingencyState" AS ENUM ('NORMAL', 'SVC_ATIVA', 'SEFAZ_INDISPONIVEL');

ALTER TABLE "Establishment" ADD COLUMN "nfeContingencyState" "NfeContingencyState" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Establishment" ADD COLUMN "nfeContingencySince" TIMESTAMP(3);
ALTER TABLE "Establishment" ADD COLUMN "nfeContingencyCheckedAt" TIMESTAMP(3);
