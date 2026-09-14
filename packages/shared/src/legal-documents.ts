export type LegalArticle = {
  id: string;
  title?: string;
  paragraphs: string[];
};

export type LegalChapter = {
  title: string;
  articles: LegalArticle[];
};

export type LegalDocument = {
  slug: string;
  title: string;
  description: string;
  effectiveDate: string;
  chapters: LegalChapter[];
};

export const LEGAL_CONTACT_EMAIL = "suporte@pedixpro.com.br";
export const LEGAL_COMPANY_PLACEHOLDER =
  "[Razão Social da Empresa], inscrita no CNPJ sob nº [●], com sede em [●]";

export const TERMS_OF_USE_DOCUMENT: LegalDocument = {
  slug: "termos",
  title: "Termos de Uso",
  description: "Regras de acesso e uso do Pedix Pro no app, web e site.",
  effectiveDate: "30 de julho de 2026",
  chapters: [
    {
      title: "Capítulo I - Disposições Gerais",
      articles: [
        {
          id: "1",
          paragraphs: [
            `Estes Termos de Uso regulam o acesso e a utilização do Pedix Pro, software disponibilizado em modelo SaaS, por meio de aplicativo mobile, sistema web, site, interfaces, funcionalidades, integrações, módulos, serviços digitais e demais recursos relacionados, de titularidade de ${LEGAL_COMPANY_PLACEHOLDER}, doravante denominada "Empresa", "Pedix Pro" ou "Licenciante".`,
          ],
        },
        {
          id: "2",
          paragraphs: [
            "Ao criar conta, acessar, contratar, assinar, navegar, testar ou utilizar qualquer funcionalidade do Pedix Pro, o usuário declara que leu, compreendeu e aceitou integralmente estes Termos de Uso, a Política de Privacidade, a Política de Cookies, a Política de Assinatura, Cancelamento e Reembolso e o Contrato de Licença de Uso do Software, quando aplicáveis.",
          ],
        },
        {
          id: "3",
          paragraphs: [
            "Caso o usuário não concorde com qualquer disposição destes Termos, deverá abster-se de acessar, contratar ou utilizar o Pedix Pro.",
          ],
        },
        {
          id: "4",
          paragraphs: [
            "O Pedix Pro destina-se a podólogos, clínicas de podologia, consultórios e profissionais autônomos para organização de informações administrativas, financeiras, operacionais e clínicas inseridas pelo próprio usuário.",
            "O Pedix Pro não realiza diagnóstico médico, não substitui avaliação clínica, não emite prescrição médica, não garante resultados clínicos e não toma decisões profissionais pelo usuário.",
          ],
        },
      ],
    },
    {
      title: "Capítulo II - Definições",
      articles: [
        {
          id: "5",
          paragraphs: [
            "Para fins destes Termos, considera-se Pedix Pro a plataforma SaaS de gestão para profissionais e estabelecimentos de podologia, incluindo suas aplicações, interfaces, bancos de dados, códigos, documentação, infraestrutura, recursos de armazenamento em nuvem e serviços associados.",
            "Usuário e a pessoa física ou jurídica que acessa, contrata, testa, cadastra-se ou utiliza o Pedix Pro, incluindo administradores, colaboradores, prepostos, profissionais autorizados e usuários vinculados a uma organização.",
            "Conteúdo do Usuário compreende dados, arquivos, imagens, documentos, textos, registros, prontuários, históricos, agendas, lançamentos financeiros e demais informações inseridas, armazenadas, transmitidas ou processadas pelo usuário no Pedix Pro.",
            "Dados de Pacientes compreendem dados pessoais e eventualmente dados pessoais sensíveis inseridos pelo usuário sobre seus pacientes, incluindo informações de saúde, histórico clínico, imagens, documentos e registros de atendimento.",
          ],
        },
      ],
    },
    {
      title: "Capítulo III - Cadastro, Conta e Credenciais",
      articles: [
        {
          id: "6",
          paragraphs: [
            "Para utilizar o Pedix Pro, o usuário deverá fornecer informações verdadeiras, completas, atualizadas e juridicamente válidas, sendo responsável por sua correção e atualização.",
          ],
        },
        {
          id: "7",
          paragraphs: [
            "O usuário declara possuir capacidade civil para contratar ou, caso atue em nome de pessoa jurídica, clínica, consultório ou terceiro, possuir poderes suficientes para vincular tal entidade a estes Termos.",
          ],
        },
        {
          id: "8",
          paragraphs: [
            "Cada conta é de uso pessoal, profissional ou institucional do contratante, sendo vedado compartilhar, ceder, alugar, vender, sublicenciar, revender ou disponibilizar credenciais a terceiros não autorizados.",
            "O usuário é integralmente responsável por manter sua senha em sigilo e por todas as atividades realizadas em sua conta, ainda que praticadas por colaboradores, sócios, prepostos, terceiros autorizados ou pessoas que tenham obtido acesso por falha de sigilo, negligência ou compartilhamento de credenciais.",
          ],
        },
      ],
    },
    {
      title: "Capítulo IV - Objeto e Funcionalidades",
      articles: [
        {
          id: "9",
          paragraphs: [
            "A Empresa concede ao usuário licença limitada, temporária, revogável, não exclusiva, não sublicenciável e intransferível de acesso e uso do Pedix Pro, exclusivamente conforme o plano contratado e a finalidade da plataforma.",
          ],
        },
        {
          id: "10",
          paragraphs: [
            "As funcionalidades poderão incluir cadastro de pacientes, prontuário eletrônico, histórico clínico, agenda, financeiro, relatórios, controle de atendimentos, cadastro de imagens, upload de documentos, armazenamento em nuvem, login por e-mail, assinatura mensal e demais recursos disponibilizados pela Empresa.",
          ],
        },
        {
          id: "11",
          paragraphs: [
            "A Empresa poderá modificar, aprimorar, substituir, suspender, limitar ou descontinuar funcionalidades, total ou parcialmente, para fins técnicos, comerciais, legais, de segurança ou de evolução do produto, observada a legislação aplicável.",
          ],
        },
      ],
    },
    {
      title: "Capítulo V - Responsabilidade Profissional do Usuário",
      articles: [
        {
          id: "12",
          paragraphs: [
            "Toda decisão clínica, técnica, terapêutica, administrativa, financeira ou profissional tomada com base em informações registradas no Pedix Pro e de responsabilidade exclusiva do usuário, que deverá observar sua habilitação, normas profissionais, deveres éticos, legislação aplicável e boas práticas da área.",
          ],
        },
        {
          id: "13",
          paragraphs: [
            "O usuário reconhece que as informações exibidas pelo Pedix Pro dependem dos dados inseridos, atualizados, interpretados e validados pelo próprio usuário, não respondendo à Empresa por erros decorrentes de dados incompletos, incorretos, desatualizados, inconsistentes ou indevidamente cadastrados.",
          ],
        },
      ],
    },
    {
      title: "Capítulo VI - Obrigações do Usuário",
      articles: [
        {
          id: "14",
          paragraphs: [
            "O usuário obriga-se a utilizar o Pedix Pro de forma lícita, ética, profissional e compatível com sua finalidade; fornecer informações verdadeiras; manter credenciais em sigilo; obter bases legais, consentimentos e autorizações necessários para inserir dados de pacientes; cumprir a LGPD, o Marco Civil da Internet, o Código de Defesa do Consumidor, o Código Civil e demais normas aplicáveis.",
          ],
        },
        {
          id: "15",
          paragraphs: [
            "É vedado ao usuário usar o Pedix Pro para fins ilícitos, fraudulentos, abusivos, discriminatórios ou ofensivos; violar direitos de terceiros; inserir malware; tentar acessar sistemas sem autorização; utilizar bots, scrapers, crawlers ou automações não autorizadas; revender acesso; compartilhar senha; praticar engenharia reversa; copiar, modificar ou explorar economicamente o software sem autorização.",
          ],
        },
        {
          id: "16",
          paragraphs: [
            "O usuário é responsável por cumprir obrigações legais, fiscais, sanitárias, éticas, profissionais e regulatórias relativas a prontuários, registros, consentimentos, documentos, dados de pacientes e guarda de informações.",
          ],
        },
      ],
    },
    {
      title: "Capítulo VII - Conteúdo, Dados e Privacidade",
      articles: [
        {
          id: "17",
          paragraphs: [
            "O usuário mantém a titularidade e responsabilidade sobre o Conteúdo do Usuário. Ao inserir conteúdo na plataforma, concede à Empresa licença limitada e necessária para hospedar, armazenar, processar, transmitir, proteger, recuperar e disponibilizar tal conteúdo exclusivamente para prestação, manutenção, segurança, suporte e melhoria do Pedix Pro.",
          ],
        },
        {
          id: "18",
          paragraphs: [
            "A Empresa não realiza controle editorial, validação clínica, auditoria técnica ou conferência prévia do Conteúdo do Usuário, salvo quando necessário para suporte, segurança, cumprimento legal, exercício regular de direitos ou apuração de violação destes Termos.",
          ],
        },
        {
          id: "19",
          paragraphs: [
            "O tratamento de dados pessoais observará a LGPD e a Política de Privacidade. Em relação aos dados do próprio usuário, a Empresa poderá atuar como controladora. Em relação aos dados de pacientes inseridos pelo usuário, a Empresa, em regra, atuará como operadora, e o usuário será o controlador responsável pela finalidade, base legal e conformidade do tratamento.",
          ],
        },
      ],
    },
    {
      title: "Capítulo VIII - Assinatura, Pagamento e Cancelamento",
      articles: [
        {
          id: "20",
          paragraphs: [
            "O acesso ao Pedix Pro poderá depender da contratação de assinatura mensal ou outro modelo comercial disponibilizado pela Empresa. Planos, valores, limites, periodicidade, formas de pagamento, testes gratuitos, promoções e condições específicas serão informados no momento da contratação ou em página própria.",
          ],
        },
        {
          id: "21",
          paragraphs: [
            "Ao contratar assinatura, o usuário autoriza a cobrança recorrente dos valores aplicáveis ao plano escolhido até que haja cancelamento válido. Inadimplência, chargeback, contestação indevida, falha de cobrança, inconsistência cadastral ou suspeita de fraude poderão gerar restrição, suspensão ou encerramento do acesso.",
          ],
        },
        {
          id: "22",
          paragraphs: [
            "O cancelamento, a suspensão, o encerramento da conta e eventual reembolso observarão a Política de Assinatura, Cancelamento e Reembolso, a legislação aplicável e as condições do plano contratado.",
          ],
        },
      ],
    },
    {
      title: "Capítulo IX - Disponibilidade, Segurança e Backups",
      articles: [
        {
          id: "23",
          paragraphs: [
            "A Empresa empreenderá esforços comercialmente razoáveis para manter o Pedix Pro disponível, seguro e funcional, ressalvadas interrupções programadas, manutenções, atualizações, falhas técnicas, indisponibilidade de terceiros, problemas de internet, servidores, nuvem, energia, telecomunicações, ataques cibernéticos, caso fortuito, força maior e eventos fora de seu controle razoável.",
          ],
        },
        {
          id: "24",
          paragraphs: [
            "Nenhum sistema eletrônico conectado à internet é absolutamente imune a falhas, vulnerabilidades, ataques ou incidentes. A Empresa adotará medidas técnicas e administrativas razoáveis para proteção da plataforma, sem garantia de segurança absoluta ou funcionamento ininterrupto.",
          ],
        },
        {
          id: "25",
          paragraphs: [
            "A Empresa poderá realizar rotinas de backup, redundância, logs e recuperação conforme critérios técnicos próprios. Tais rotinas destinam-se a continuidade operacional e não constituem garantia individual absoluta de recuperação integral, imediata ou permanente de todo conteúdo inserido pelo usuário.",
            "O usuário deve manter cópias, exportações ou registros próprios quando necessários ao cumprimento de obrigações legais, fiscais, éticas, profissionais, regulatórias ou administrativas.",
          ],
        },
      ],
    },
    {
      title: "Capítulo X - Propriedade Intelectual e Licença",
      articles: [
        {
          id: "26",
          paragraphs: [
            "O Pedix Pro, incluindo software, código-fonte, código objeto, arquitetura, interfaces, layout, marcas, nomes, logotipos, textos, bancos de dados, design, fluxos, funcionalidades, documentação, materiais, know-how, algoritmos e elementos visuais, é protegido por direitos de propriedade intelectual, segredo empresarial e demais normas aplicáveis.",
          ],
        },
        {
          id: "27",
          paragraphs: [
            "Estes Termos não transferem ao usuário qualquer direito de propriedade intelectual sobre o Pedix Pro, concedendo apenas licença limitada de uso conforme contratado.",
          ],
        },
      ],
    },
    {
      title: "Capítulo XI - Exclusão de Garantias e Limitação de Responsabilidade",
      articles: [
        {
          id: "28",
          paragraphs: [
            "O Pedix Pro é fornecido conforme disponibilizado, dentro das condições do plano contratado e dos limites técnicos razoáveis do serviço, sem garantia de adequação à finalidade específica não informada, resultado clínico, resultado financeiro, ausência absoluta de erros, funcionamento ininterrupto ou compatibilidade com todos os dispositivos, sistemas, navegadores, redes ou integrações.",
          ],
        },
        {
          id: "29",
          paragraphs: [
            "Na máxima extensão permitida pela legislação brasileira, a Empresa não será responsável por danos decorrentes de uso indevido da plataforma, decisões profissionais do usuário, dados incorretos, falha de internet ou terceiros, acesso indevido por compartilhamento de senha, perda de dados por culpa do usuário, caso fortuito, força maior, ataques hackers, indisponibilidade temporária, violação legal praticada pelo usuário ou uso em desacordo com estes Termos.",
          ],
        },
        {
          id: "30",
          paragraphs: [
            "Nenhuma disposição destes Termos exclui ou limita responsabilidade que não possa ser excluída ou limitada por lei, especialmente em relações de consumo quando aplicável.",
          ],
        },
      ],
    },
    {
      title: "Capítulo XII - Suspensão, Encerramento e Indenização",
      articles: [
        {
          id: "31",
          paragraphs: [
            "A Empresa poderá suspender ou encerrar o acesso do usuário em caso de violação destes Termos, inadimplência, fraude, uso ilícito ou abusivo, tentativa de violação de segurança, compartilhamento irregular de conta, violação de propriedade intelectual, uso automatizado não autorizado, ordem judicial, determinação de autoridade competente ou risco à segurança e estabilidade da plataforma.",
          ],
        },
        {
          id: "32",
          paragraphs: [
            "O usuário compromete-se a indenizar, defender e manter indenes a Empresa, seus sócios, administradores, colaboradores, representantes, fornecedores e parceiros contra perdas, danos, custos, reclamações, autuações, ações judiciais ou administrativas decorrentes de uso indevido, violação destes Termos, tratamento irregular de dados pessoais, informações incorretas, decisões profissionais, descumprimento legal ou violação de direitos de terceiros.",
          ],
        },
      ],
    },
    {
      title: "Capítulo XIII - Alterações, Lei Aplicável e Foro",
      articles: [
        {
          id: "33",
          paragraphs: [
            "A Empresa poderá alterar estes Termos para refletir mudanças legais, regulatórias, comerciais, técnicas, operacionais, de segurança, de funcionalidades ou de modelo de negócio. O uso contínuo do Pedix Pro após a entrada em vigor das alterações constituirá aceitação dos novos Termos.",
          ],
        },
        {
          id: "34",
          paragraphs: [
            "Estes Termos serão regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de [Cidade/UF da sede da Empresa], salvo quando a legislação aplicável determinar foro diverso, especialmente em relações de consumo.",
          ],
        },
        {
          id: "35",
          paragraphs: [
            `Solicitações, dúvidas e notificações relacionadas a estes Termos devem ser enviadas para ${LEGAL_CONTACT_EMAIL}.`,
          ],
        },
      ],
    },
  ],
};

export const PRIVACY_POLICY_DOCUMENT: LegalDocument = {
  slug: "privacidade",
  title: "Política de Privacidade",
  description:
    "Como o Pedix Pro acessa, coleta, usa e compartilha dados pessoais, incluindo localização.",
  effectiveDate: "14 de setembro de 2026",
  chapters: [
    {
      title: "Capítulo I - Disposições Gerais",
      articles: [
        {
          id: "1",
          paragraphs: [
            `Esta Política de Privacidade descreve como ${LEGAL_COMPANY_PLACEHOLDER}, titular do Pedix Pro, trata dados pessoais no contexto do site, sistema web, aplicativo Android, aplicativo iOS, área logada, atendimento, cobrança, suporte, operação em nuvem e demais serviços relacionados.`,
          ],
        },
        {
          id: "2",
          paragraphs: [
            "Esta Política deve ser lida em conjunto com os Termos de Uso, a Política de Cookies, o Contrato de Licença de Uso do Software e a Política de Assinatura, Cancelamento e Reembolso.",
          ],
        },
        {
          id: "3",
          paragraphs: [
            "O tratamento de dados pessoais observará a Lei Geral de Proteção de Dados Pessoais, Lei nº 13.709/2018, o Marco Civil da Internet, Lei nº 12.965/2014, o Código de Defesa do Consumidor, o Código Civil e demais normas brasileiras aplicáveis.",
          ],
        },
      ],
    },
    {
      title: "Capítulo II - Papéis na LGPD",
      articles: [
        {
          id: "4",
          paragraphs: [
            "A Empresa poderá atuar como controladora em relação aos dados pessoais dos usuários, representantes, administradores, colaboradores, leads, visitantes do site e titulares que interajam diretamente com a Empresa para cadastro, contratação, cobrança, suporte, comunicações, segurança, prevenção a fraudes e gestão da relação contratual.",
          ],
        },
        {
          id: "5",
          paragraphs: [
            "Em relação aos dados cadastrados pela organização contratante, como dados de clientes, contatos, produtos, pedidos e visitas comerciais, a Empresa poderá atuar como operadora, tratando esses dados em nome da organização, que é responsável pela finalidade, base legal e conformidade do tratamento.",
          ],
        },
      ],
    },
    {
      title: "Capítulo III - Dados Pessoais Tratados",
      articles: [
        {
          id: "6",
          paragraphs: [
            "Podemos tratar dados cadastrais e de identificação, como nome, e-mail, telefone, CPF, CNPJ, razão social, nome fantasia, endereço, identificadores profissionais, cargo, organização, dados de login e credenciais técnicas.",
          ],
        },
        {
          id: "7",
          paragraphs: [
            "Podemos tratar dados de uso e segurança, como endereço IP, identificadores de dispositivo, logs de acesso, eventos de autenticação, data e hora de uso, páginas acessadas, funcionalidades utilizadas, tipo de navegador, sistema operacional, registros de erro e metadados técnicos.",
          ],
        },
        {
          id: "8",
          paragraphs: [
            "Podemos tratar dados comerciais e financeiros, como plano contratado, status da assinatura, histórico de pagamentos, meio de pagamento, dados fiscais, notas, cobranças, inadimplência, cancelamento, reembolso e comunicações relacionadas.",
          ],
        },
        {
          id: "9",
          paragraphs: [
            "Localização. O aplicativo mobile Pedix Pro acessa, coleta e usa dados de localização precisa do dispositivo (coordenadas geográficas, data, hora e precisão aproximada), mediante permissão do sistema operacional e declaração em destaque no app, nas seguintes hipóteses:",
            "(a) Foreground (enquanto o app está em uso): para exibir o mapa de rota, clientes próximos, check-in e check-out de visitas e, quando o usuário solicita, para gravar as coordenadas do endereço de um cliente no cadastro;",
            "(b) Background (em segundo plano, com o app fechado ou não em uso): somente quando o vendedor ativa voluntariamente o rastreamento de rota. Nesse caso, a localização pode ser coletada de forma contínua e enviada à organização à qual o vendedor está vinculado, para acompanhamento operacional de rotas e visitas comerciais;",
            "Os dados de localização são associados ao usuário e à sua organização. Não utilizamos localização para publicidade, remarketing ou venda a terceiros. O histórico operacional de localização é retido pelo tempo necessário à finalidade (em regra, poucos dias) e depois eliminado ou anonimizado, ressalvadas obrigações legais. O usuário pode desativar o rastreamento no próprio app e gerenciar ou revogar a permissão nas configurações do aparelho; a revogação pode limitar mapa, rotas, check-ins e rastreamento.",
          ],
        },
      ],
    },
    {
      title: "Capítulo IV - Finalidades do Tratamento",
      articles: [
        {
          id: "10",
          paragraphs: [
            "Os dados pessoais poderão ser tratados para criar e administrar contas, autenticar usuários, prestar o serviço, armazenar informações, disponibilizar funcionalidades, executar assinatura, processar pagamentos, emitir documentos fiscais, prestar suporte, enviar comunicações transacionais, prevenir fraudes, proteger a plataforma, cumprir obrigações legais e exercer direitos em processos judiciais, administrativos ou arbitrais.",
          ],
        },
        {
          id: "11",
          paragraphs: [
            "Finalidade da Localização. Tratamos dados de localização exclusivamente para funcionalidades do Pedix Pro: mapa, planejamento de rota, check-in e check-out de visitas, gravação pontual de coordenadas de cliente e, quando o rastreamento de rota é ativado pelo vendedor, acompanhamento da jornada comercial pela gestão da organização. Não utilizamos dados de localização para publicidade.",
          ],
        },
      ],
    },
    {
      title: "Capítulo V - Bases Legais",
      articles: [
        {
          id: "12",
          paragraphs: [
            "A Empresa poderá tratar dados pessoais com fundamento em execução de contrato, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse, proteção ao crédito, prevenção à fraude e segurança do titular, consentimento quando exigido e demais bases legais previstas na LGPD.",
          ],
        },
        {
          id: "13",
          paragraphs: [
            "O rastreamento de rota é opcional e depende de ação voluntária do vendedor no aplicativo. A organização contratante é responsável por informar seus colaboradores sobre a finalidade operacional do recurso e pelas bases legais aplicáveis à sua operação.",
          ],
        },
      ],
    },
    {
      title: "Capítulo VI - Compartilhamento",
      articles: [
        {
          id: "14",
          paragraphs: [
            "A Empresa poderá compartilhar dados pessoais com fornecedores e suboperadores necessários à operação do Pedix Pro, incluindo hospedagem em nuvem, banco de dados, armazenamento, e-mail, notificações, suporte, analytics, segurança, meios de pagamento, antifraude, processamento fiscal, auditoria e consultoria técnica ou jurídica.",
          ],
        },
        {
          id: "15",
          paragraphs: [
            "A Empresa também poderá compartilhar dados quando necessário para cumprir lei, ordem judicial, requisição de autoridade competente, proteger direitos da Empresa, prevenir fraude, investigar uso indevido, responder a incidentes de segurança ou viabilizar reorganização societária, fusão, aquisição, venda de ativos ou sucessão empresarial.",
          ],
        },
        {
          id: "16",
          paragraphs: [
            "A Empresa não vende dados pessoais. Dados de localização do vendedor são disponibilizados apenas à organização à qual ele está vinculado e a usuários autorizados por ela, além dos fornecedores técnicos necessários para operar o serviço.",
          ],
        },
      ],
    },
    {
      title: "Capítulo VII - Cookies, Dispositivos e Permissões",
      articles: [
        {
          id: "17",
          paragraphs: [
            "O Pedix Pro poderá utilizar cookies, armazenamento local, pixels, SDKs e tecnologias semelhantes para login, segurança, preferências, funcionamento da plataforma, análise de desempenho, melhoria da experiência e prevenção a fraudes, conforme Política de Cookies.",
          ],
        },
        {
          id: "18",
          paragraphs: [
            "No aplicativo mobile, determinadas funcionalidades dependem de permissões do dispositivo, incluindo câmera, notificações, localização (precisa), arquivos, imagens e conexão de rede. Antes de qualquer pedido de permissão de localização ao sistema operacional, o app exibe uma declaração em destaque explicando o acesso, a coleta e o uso. A localização em segundo plano só é solicitada depois que o vendedor ativa o rastreamento de rota e aceita essa declaração; ela pode ser desativada no app e gerenciada nas configurações do aparelho. A revogação poderá limitar mapa, rotas, check-ins e rastreamento. A Política de Privacidade completa está em https://pedixpro.com.br/privacidade.",
          ],
        },
      ],
    },
    {
      title: "Capítulo VIII - Armazenamento, Retenção e Exclusão",
      articles: [
        {
          id: "19",
          paragraphs: [
            "Os dados pessoais serão armazenados pelo tempo necessário ao cumprimento das finalidades desta Política, execução do contrato, manutenção da conta, prestação do serviço, cumprimento de obrigações legais, fiscais, contábeis e regulatórias, exercício regular de direitos, segurança, auditoria, prevenção a fraudes e resolução de disputas.",
          ],
        },
        {
          id: "20",
          paragraphs: [
            "A exclusão de dados ou conta poderá ser solicitada pelos canais oficiais. A Empresa poderá reter determinados dados pelo prazo necessário ao cumprimento de obrigações legais, contratuais, fiscais, regulatórias, auditoria, segurança, prevenção a fraudes ou exercício regular de direitos.",
          ],
        },
      ],
    },
    {
      title: "Capítulo IX - Segurança da Informação",
      articles: [
        {
          id: "21",
          paragraphs: [
            "A Empresa adotará medidas técnicas e administrativas razoáveis para proteger dados pessoais contra acessos não autorizados, perda, destruição, alteração, comunicação ou tratamento inadequado, considerando a natureza dos dados, riscos envolvidos, estado da técnica e porte da operação.",
          ],
        },
        {
          id: "22",
          paragraphs: [
            "Nenhuma plataforma conectada à internet é absolutamente segura. O usuário deve proteger credenciais, utilizar dispositivos seguros, manter sistemas atualizados, evitar compartilhamento de senha e comunicar imediatamente suspeitas de acesso indevido.",
          ],
        },
        {
          id: "23",
          paragraphs: [
            "Em caso de incidente de segurança relevante envolvendo dados pessoais, a Empresa adotará as medidas cabíveis nos termos da LGPD, considerando sua posição como controladora ou operadora, grau de risco, informações disponíveis e exigências da ANPD ou de autoridades competentes.",
          ],
        },
      ],
    },
    {
      title: "Capítulo X - Direitos dos Titulares",
      articles: [
        {
          id: "24",
          paragraphs: [
            "Nos termos da LGPD, o titular poderá solicitar confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio ou eliminação, portabilidade, informações sobre compartilhamento, revogação de consentimento, oposição a tratamento irregular e revisão de decisões automatizadas, quando aplicável.",
          ],
        },
        {
          id: "25",
          paragraphs: [
            "Quando a solicitação envolver dados de clientes, pedidos, visitas ou localização tratados em nome de uma organização, a Empresa poderá encaminhar a demanda à organização responsável ou aguardar suas instruções, salvo quando a lei determinar conduta diversa.",
          ],
        },
      ],
    },
    {
      title: "Capítulo XI - Transferência Internacional",
      articles: [
        {
          id: "26",
          paragraphs: [
            "A Empresa poderá utilizar fornecedores de tecnologia, nuvem, suporte, segurança, pagamento ou comunicação localizados no Brasil ou no exterior. Quando houver transferência internacional de dados pessoais, serão observadas as hipóteses e salvaguardas previstas na LGPD.",
          ],
        },
      ],
    },
    {
      title: "Capítulo XII - Crianças e Adolescentes",
      articles: [
        {
          id: "27",
          paragraphs: [
            "O Pedix Pro não é destinado ao uso direto por crianças ou adolescentes. A organização contratante deve assegurar que os usuários autorizados tenham vínculo profissional e idade compatível com o uso da plataforma.",
          ],
        },
      ],
    },
    {
      title: "Capítulo XIII - Alterações e Contato",
      articles: [
        {
          id: "28",
          paragraphs: [
            "Esta Política poderá ser atualizada para refletir alterações legais, regulatórias, técnicas, operacionais, comerciais ou de funcionalidades. A versão vigente será publicada nos canais oficiais do Pedix Pro.",
          ],
        },
        {
          id: "29",
          paragraphs: [
            `Para exercer direitos, solicitar informações, corrigir dados, pedir exclusão ou tratar de privacidade, entre em contato pelo e-mail ${LEGAL_CONTACT_EMAIL}.`,
          ],
        },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = [
  TERMS_OF_USE_DOCUMENT,
  PRIVACY_POLICY_DOCUMENT,
] as const;

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug);
}
