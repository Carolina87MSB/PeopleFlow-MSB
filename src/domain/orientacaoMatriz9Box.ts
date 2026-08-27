// Orientação para o Gestor na Matriz 9 Box — camada exclusivamente
// consultiva/informativa, sem nenhuma influência no cálculo de Desempenho,
// Potencial ou posicionamento (ver domain/matriz9Box.ts, intocado). Conteúdo
// estático, mesmo padrão de NOMES_QUADRANTES_MATRIZ_9_BOX: chave externa é a
// faixa de Potencial (linha), interna é a de Desempenho (coluna). Texto
// validado com o RH antes da implementação — não reescrever sem aprovação.

import type { FaixaMatriz9Box } from "../types/domain";

export interface OrientacaoQuadrante {
  nome: string;
  /** Resumo de 1 linha — usado só na consulta rápida (ícone ⓘ na própria célula da grade). */
  principalPontoDeAtencao: string;
  oQueSignifica: string;
  oQueObservar: string[];
  comoConduzirFeedback: string;
  perguntas: string[];
  proximoPasso: string;
}

/** Texto fixo de abertura da tela — explica que o quadrante é a combinação
 * de duas dimensões e não deve ser usado isoladamente para decisões de
 * promoção, movimentação ou desligamento. */
export const ORIENTACAO_GERAL_9BOX =
  "A Matriz 9 Box é uma ferramenta de apoio à gestão de pessoas. O posicionamento representa a combinação entre " +
  "Desempenho e Potencial observados no ciclo avaliado e deve ser analisado em conjunto com os resultados da AVD, " +
  "competências, indicadores, histórico e contexto profissional do colaborador. O quadrante não deve ser utilizado " +
  "isoladamente para decisões de promoção, movimentação ou desligamento.";

export const EXPLICACAO_DESEMPENHO =
  "Indica o nível de entrega apresentado pelo colaborador no ciclo avaliado, considerando resultados, indicadores e competências.";

export const EXPLICACAO_POTENCIAL =
  "Indica a capacidade demonstrada ou percebida para assumir desafios, responsabilidades ou níveis maiores de complexidade no futuro.";

export const ORIENTACAO_MATRIZ_9_BOX: Record<FaixaMatriz9Box, Record<FaixaMatriz9Box, OrientacaoQuadrante>> = {
  Alto: {
    Baixo: {
      nome: "Desenvolver com Prioridade",
      principalPontoDeAtencao:
        "Identificar se o baixo desempenho decorre de obstáculos técnicos, estruturais ou de contexto — não de falta de capacidade.",
      oQueSignifica:
        "Este quadrante indica um colaborador com alto potencial identificado, mas cuja entrega no ciclo avaliado ficou " +
        "abaixo do esperado. O resultado é a combinação de duas dimensões distintas — Potencial e Desempenho — e não " +
        "deve ser interpretado como um julgamento sobre a capacidade ou o valor do colaborador, e sim como um ponto " +
        "de partida para investigação e apoio.",
      oQueObservar: [
        "O baixo desempenho está relacionado a um fator pontual do ciclo ou é uma tendência?",
        "As competências e os KPIs indicam uma lacuna específica ou há fatores de contexto?",
        "Houve apoio, direcionamento e feedback contínuo ao longo do ciclo?",
      ],
      comoConduzirFeedback:
        "Comece entendendo as causas antes de discutir a nota. Identifique obstáculos técnicos, estruturais ou de " +
        "contexto que possam estar limitando a entrega. Evite comparações com colegas e mantenha o foco em fatos e evidências.",
      perguntas: [
        "O que mais dificultou alcançar os resultados esperados neste ciclo?",
        "Em quais frentes você sente que precisaria de mais apoio?",
        "O que deu certo neste ciclo, mesmo com o resultado abaixo do esperado?",
        "O que podemos ajustar juntos para o próximo ciclo?",
      ],
      proximoPasso: "PDI com foco nas lacunas identificadas, prazos definidos e acompanhamento mais frequente.",
    },
    Médio: {
      nome: "Talento em Desenvolvimento",
      principalPontoDeAtencao: "Reconhecer o que já funciona antes de focar exclusivamente nas lacunas de desenvolvimento.",
      oQueSignifica:
        "Reflete um colaborador com potencial elevado e entrega consistente, ainda com espaço de evolução. É um " +
        "posicionamento positivo que indica trajetória de crescimento em construção.",
      oQueObservar: [
        "Quais competências ou KPIs desenvolvidos teriam maior impacto?",
        "O colaborador reconhece seu próprio potencial?",
        "Existem oportunidades reais para esse desenvolvimento?",
      ],
      comoConduzirFeedback:
        "Reconheça primeiro o que já funciona. Depois, seja específico sobre qual competência ou entrega teria maior " +
        "impacto se fortalecida.",
      perguntas: [
        "O que você sente que já domina bem?",
        "Em quais frentes gostaria de evoluir?",
        "Que desafio ajudaria você a colocar esse potencial em prática?",
        "Como posso apoiar melhor seu desenvolvimento?",
      ],
      proximoPasso: "PDI com 1 ou 2 competências prioritárias e revisão em médio prazo.",
    },
    Alto: {
      nome: "Talento Estratégico",
      principalPontoDeAtencao:
        "Risco de retenção e perspectiva de crescimento — a conversa deve ir além da devolutiva operacional.",
      oQueSignifica:
        "Representa a combinação mais consistente entre potencial e entrega. Indica resultados sólidos e trajetória " +
        "de crescimento relevante, sem implicar promoção automática.",
      oQueObservar: [
        "Qual é a aspiração de carreira do colaborador?",
        "O reconhecimento é compatível com sua contribuição?",
        "Existe risco de estagnação ou perda de perspectiva?",
      ],
      comoConduzirFeedback:
        "Reconheça o resultado de forma direta e específica. Dedique tempo real a carreira, reconhecimento e próximos desafios.",
      perguntas: [
        "Como você enxerga sua evolução dentro da empresa?",
        "O que tornaria seu trabalho ainda mais desafiador?",
        "Você sente que seus resultados têm reconhecimento adequado?",
        "Há algo que gostaria de desenvolver para seu próximo passo?",
      ],
      proximoPasso: "Discussões de carreira e, quando aplicável, sucessão, sempre com base nos critérios formais da organização.",
    },
  },
  Médio: {
    Baixo: {
      nome: "Reavaliar Desempenho",
      principalPontoDeAtencao: "Confirmar se há evidências concretas que sustentam a nota antes de conduzir o feedback.",
      oQueSignifica:
        "Indica potencial dentro da média esperada, mas desempenho abaixo do esperado no ciclo. É importante " +
        "confirmar se é dificuldade recorrente ou situação pontual.",
      oQueObservar: [
        "O resultado é consistente com ciclos anteriores?",
        "Existem evidências concretas que sustentam a nota?",
        "As expectativas foram claras e houve feedback ao longo do ciclo?",
      ],
      comoConduzirFeedback:
        "Seja objetivo e utilize exemplos concretos. Mantenha tom direto, sem julgamento sobre intenção ou comprometimento.",
      perguntas: [
        "O que explica o resultado deste ciclo?",
        "Quais expectativas poderiam ter ficado mais claras?",
        "O que precisaria mudar para o próximo ciclo?",
        "Que acompanhamento ajudaria você a atingir os resultados?",
      ],
      proximoPasso: "PDI com metas objetivas, mensuráveis, prazo definido e acompanhamento próximo.",
    },
    Médio: {
      nome: "Contribuidor Consistente",
      principalPontoDeAtencao: "Reconhecer a consistência da entrega, sem impor uma expectativa de crescimento não manifestada.",
      oQueSignifica:
        "Representa entrega dentro do esperado, de forma estável e confiável. É um resultado importante para a " +
        "sustentação da operação.",
      oQueObservar: [
        "Há interesse em assumir responsabilidades adicionais?",
        "Existe competência que poderia elevar a entrega?",
        "O reconhecimento é proporcional à consistência?",
      ],
      comoConduzirFeedback:
        "Reconheça explicitamente a consistência e explore o que poderia motivar uma evolução, sem impor crescimento.",
      perguntas: [
        "O que mais te motiva no trabalho hoje?",
        "Existe alguma responsabilidade que gostaria de assumir?",
        "Em que área sente que poderia crescer?",
        "Como avalia o suporte recebido da liderança?",
      ],
      proximoPasso: "PDI leve, com uma competência de desenvolvimento, ou manutenção do plano atual caso não haja necessidade de mudança.",
    },
    Alto: {
      nome: "Alto Desempenho",
      principalPontoDeAtencao: "Entender se a falta de crescimento percebido reflete falta de interesse ou falta de oportunidade.",
      oQueSignifica:
        "Indica entrega acima do esperado, cujo potencial de crescimento ainda não está totalmente mapeado ou é " +
        "percebido como mais limitado no momento.",
      oQueObservar: [
        "Existe interesse em crescer?",
        "Existem oportunidades para testar esse potencial?",
        "O alto desempenho vem sendo reconhecido?",
      ],
      comoConduzirFeedback:
        "Reconheça claramente o resultado. Explore se existe interesse em crescimento e se há oportunidades para isso.",
      perguntas: [
        "Você sente que seus resultados são reconhecidos?",
        "Existe algum desafio que gostaria de experimentar?",
        "Você se vê buscando crescimento nos próximos ciclos?",
        "O que ajudaria você a evoluir ainda mais?",
      ],
      proximoPasso:
        "Se houver interesse, mapear oportunidades concretas de desenvolvimento de carreira. Caso contrário, reforçar " +
        "o reconhecimento pela contribuição atual.",
    },
  },
  Baixo: {
    Baixo: {
      nome: "Atenção Imediata",
      principalPontoDeAtencao: "Resultado não deve ser tratado como sentença definitiva; requer conversa estruturada e apoio do RH.",
      oQueSignifica:
        "Indica resultado abaixo do esperado nas duas dimensões. Não deve ser tratado como sentença definitiva, mas " +
        "como ponto de partida para uma conversa estruturada.",
      oQueObservar: [
        "Esse resultado já vinha sendo sinalizado?",
        "Existem fatores de contexto que ajudam a explicar o cenário?",
        "As expectativas foram claras ao longo do tempo?",
      ],
      comoConduzirFeedback:
        "Seja direto, mas evite que essa seja a primeira sinalização recebida pelo colaborador. Estabeleça expectativas " +
        "claras, sem rótulos ou julgamentos pessoais.",
      perguntas: [
        "Como você avalia seu próprio ciclo?",
        "O que precisa mudar para os próximos resultados serem diferentes?",
        "Que apoio ou direcionamento ajudaria?",
        "Existe algum fator que esteja impactando seu trabalho e que você gostaria de compartilhar para compreendermos melhor o cenário?",
      ],
      proximoPasso: "Plano de ação formal, construído com participação do RH, com expectativas objetivas, prazos e acompanhamento próximo.",
    },
    Médio: {
      nome: "Estável",
      principalPontoDeAtencao: "Estabilidade é um resultado legítimo — evitar forçar uma narrativa de desenvolvimento não desejada.",
      oQueSignifica:
        "Representa entrega esperada para a função, com potencial de crescimento percebido como mais limitado no " +
        "momento. Estabilidade é um resultado legítimo e valioso.",
      oQueObservar: [
        "O colaborador está satisfeito com o papel atual?",
        "A entrega está alinhada às necessidades da função?",
        "A contribuição está sendo reconhecida?",
      ],
      comoConduzirFeedback:
        "Reconheça o valor da estabilidade sem forçar uma narrativa de desenvolvimento que não faça sentido para o colaborador.",
      perguntas: [
        "Você está satisfeito com seu papel atual?",
        "Existe algo que gostaria de mudar?",
        "O que faz você se sentir reconhecido?",
        "Há algum apoio que gostaria de receber?",
      ],
      proximoPasso: "Manter acompanhamento regular. PDI somente quando houver necessidade ou interesse de desenvolvimento.",
    },
    Alto: {
      nome: "Especialista Consolidado",
      principalPontoDeAtencao: "Valorizar a especialização com formas de reconhecimento além da progressão de cargo.",
      oQueSignifica:
        "Indica domínio consistente da função atual e entrega acima do esperado, com potencial de crescimento " +
        "percebido como mais limitado — frequentemente associado a alto nível de especialização.",
      oQueObservar: [
        "O reconhecimento é proporcional ao valor técnico entregue?",
        "Existem formas de reconhecimento além da progressão de cargo?",
        "Existe risco de o colaborador se sentir menos valorizado?",
      ],
      comoConduzirFeedback:
        "Valorize explicitamente a especialização. Explore o tipo de reconhecimento que realmente importa para a " +
        "pessoa, sem presumir que crescimento vertical seja seu objetivo.",
      perguntas: [
        "O que faz você se sentir reconhecido?",
        "Teria interesse em atuar como referência técnica ou mentor?",
        "Existe algo que gostaria de ver mais valorizado?",
        "Como enxerga sua trajetória na empresa?",
      ],
      proximoPasso: "Fortalecer reconhecimento pela especialização, como referência técnica, mentoria ou outras formas de valorização aplicáveis.",
    },
  },
};

/** Ponto único de leitura da orientação — mesmo padrão de posicionarMatriz9Box(). */
export function orientacaoDoQuadrante(faixaPotencial: FaixaMatriz9Box, faixaDesempenho: FaixaMatriz9Box): OrientacaoQuadrante {
  return ORIENTACAO_MATRIZ_9_BOX[faixaPotencial][faixaDesempenho];
}
