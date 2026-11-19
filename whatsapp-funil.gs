// ============================================
// SIPOP — Funil de qualificação no WhatsApp (Evolution API + Apps Script)
//
// Mais um arquivo do MESMO projeto do apps-script.gs (crie "whatsapp-funil.gs"
// no editor do Apps Script e cole este código). O roteiro completo, com o
// porquê de cada mensagem, está em ../funil-whatsapp-qualificacao.md.
//
// Usa helpers dos outros arquivos:
//   apps-script.gs            — SHEET_NAME, EMAIL_RECIPIENTS, formatPhoneBR, asTextFormula,
//                               findLeadHeaderRow_, resolveLeadColumns_
//   apps-script-details.gs    — splitDetails
//   whatsapp-first-contact.gs — WHATSAPP (SENT_HEADER), getEvolutionConfig_
//   followup-sem-agendamento.gs — sendEvolutionMedia_
//   followup-ebook-imagem.gs  — FOLLOWUP_EBOOK_IMAGE_BASE64
//   remarketing.gs            — ensureColumn_
//   agenda.gs                 — AGENDA, agendaAssignLeadToken_, agendaBookUrl_,
//                               agendaReadBookings_, agendaBookingsSheet_
//
// O QUE FAZ
// O lead clica no anúncio (Click-to-WhatsApp) e manda a mensagem pré-preenchida.
// A Evolution API avisa este script (webhook -> doPost), que conduz a conversa:
// boas-vindas com áudio do Gaspar, as mesmas perguntas do formulário da LP, uma
// por vez, a mesma nota do lead (corte 6) e, no fim, o link de agendamento.
//
//   nota >= 6  Rota A — áudio por fase do estudo, pede o e-mail, manda o link
//   nota 3–5   Rota B — áudio + "quer começar agora?"; sim = Rota A
//   nota <= 2  Rota C — áudio de despedida + publicações (graduando cai aqui direto)
//   fora da saúde  Rota D — despedida educada
//
// ONDE FICAM OS DADOS
//   - Aba "Funil WhatsApp" (criada sozinha): uma linha por conversa, com a etapa,
//     as respostas, a nota e os controles. Para devolver uma conversa ao bot,
//     apague a célula "Pausado".
//   - Aba de contatos (a mesma do formulário): cada conversa vira um lead, com
//     Source "WhatsApp — Anúncio B6" (ou V1…V5 / orgânico), nome, telefone,
//     e-mail, área, estágio, objetivo e o resumo "Nota do lead: …" que o
//     splitDetails separa em colunas. A coluna "WhatsApp (primeiro contato)"
//     recebe "Funil WhatsApp": assim o primeiro contato e o follow-up do
//     formulário não mandam mensagem para quem já está no funil.
//
// QUANDO O BOT PARA (coluna "Pausado")
//   - o lead pede atendente ou erra a resposta 2 vezes seguidas: a equipe
//     recebe um e-mail com o resumo e o link do chat;
//   - alguém da equipe escreve na conversa pelo celular/WhatsApp Web durante
//     as perguntas: o bot sai e não volta mais (a não ser que apaguem "Pausado");
//   - o lead escreve depois do fim do roteiro (link enviado, agendado, encerrado).
//
// ÁUDIOS
// O script manda cada áudio como nota de voz a partir de
// FUNIL.AUDIO_BASE_URL + ID + FUNIL.AUDIO_EXT (ex.: .../audio/funil/A1.mp3).
// Enquanto um áudio não existir (404), vai o mesmo texto por escrito. Ou seja:
// dá para ligar o funil antes de o Gaspar gravar, e cada áudio entra sozinho
// assim que o arquivo for publicado no site (pasta SIPOP/src/audio/funil/).
//
// CONFIGURAÇÃO (uma vez)
// 1. Propriedades do script (além das EVOLUTION_* que já existem):
//      FUNIL_WEBHOOK_SECRET — um texto aleatório qualquer (ex.: 24 letras e números)
//      FUNIL_ENTRADA        — "gatilho" (padrão: só entra quem mandar a mensagem
//                             do anúncio, "…avaliar meu projeto…") ou "todos"
//                             (qualquer número novo que escrever entra no funil)
//      FUNIL_SO_NUMEROS     — opcional, para testar: números com DDI separados
//                             por vírgula. Preenchido, SÓ esses números entram.
// 2. Implantar > Gerenciar implantações > editar > Nova versão (a URL não muda).
// 3. Rode setupFunilWebhook() e autorize: ele aponta o webhook da instância na
//    Evolution para este Web App (evento MESSAGES_UPSERT). Se a instância já
//    tiver outro webhook, ele avisa no log e não mexe.
// 4. Rode setupFunilTrigger(): liga os follow-ups (a cada 5 min).
// 5. Teste com FUNIL_SO_NUMEROS = seu número: mande "Oi, quero avaliar meu
//    projeto" para o WhatsApp do SIPOP e responda as perguntas.
//
// FUNÇÕES ÚTEIS (rode pelo editor)
//   setupFunilWebhook() / setupFunilTrigger() / removeFunilTrigger()
//   previewFunilConversa() — simula uma conversa inteira no log, sem enviar nada
//   resetFunilContato()    — apaga a conversa de FUNIL_RESET_NUMERO da aba do funil
//                            (para testar de novo com o mesmo número)
// ============================================

const FUNIL = {
    SHEET:      'Funil WhatsApp',
    CUTOFF:     6,      // nota mínima da Rota A — a mesma do LEAD_SCORE da LP
    WARM_MIN:   3,      // Rota B: de WARM_MIN até CUTOFF - 1

    ENTRY_TEXT: 'avaliar meu projeto',
    // Origem pelo texto pré-preenchido de cada criativo (o mais específico primeiro)
    ORIGINS: [
        ['(prazo)', 'V1'], ['(erro)', 'V2'], ['(forest)', 'V3'],
        ['(orientador)', 'V4'], ['(etapas)', 'V5'], ['avaliar meu projeto', 'B6'],
    ],
    SOURCE:             'WhatsApp — Anúncio',
    FIRST_CONTACT_MARK: 'Funil WhatsApp',

    AUDIO_BASE_URL: 'https://sipopscience.com/audio/funil/',
    AUDIO_EXT:      '.mp3',

    TYPING_MS:        2500,   // "digitando…" antes de cada texto
    SHORT_TYPING_MS:  1500,
    RECORDING_MS:     4000,   // "gravando áudio…" antes de cada áudio
    THINKING_MS:      6000,   // pausa de "deixa eu dar uma olhada"
    DETAILS_GRACE_MS: 15000,  // espera mais mensagens depois do 1º "detalhe"
    DETAILS_TIMEOUT_MIN: 3,   // sem resposta em "detalhes": segue sozinho
    BUSY_MS:          4 * 60000,
    HUMAN_GRACE_MS:   30000,  // mensagem nossa sem ID conhecido logo após um envio do bot = do bot

    // Follow-ups (minutos desde a última mensagem do bot), só das 8h às 21h
    FOLLOWUP_START_MIN: 8 * 60,
    FOLLOWUP_END_MIN:   21 * 60,
    FOLLOWUP_ASK_MIN:   [15, 180, 1440],   // parou no meio das perguntas
    FOLLOWUP_LINK_MIN:  [30, 1440, 4320],  // recebeu o link e não agendou
    TRIGGER_MINUTES:    5,

    UTC_OFFSET_HOURS: -3,
    MAX_QUEUE:        10,
};

const FUNIL_EMOJI_NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

// ============================================
// PERGUNTAS — `label` é o rótulo da LP (vai para a planilha), `text` é o que
// aparece no WhatsApp. `points` repete o LEAD_SCORE de lp-publicar.js.
// `keywords` deixa o lead responder por extenso ("dados coletados").
// `exit`: 'C' (nutrição) ou 'D' (fora do escopo) encerra as perguntas ali.
// ============================================

const FUNIL_ORDER = ['fase', 'tipo_estudo', 'estagio', 'area', 'objetivo', 'prazo'];

const FUNIL_QUESTIONS = {
    fase: {
        sheet: 'Fase',
        intro: 'Me conta: em que fase está o seu estudo hoje?',
        hint:  '_É só responder com o número._',
        options: [
            { value: 'ideia', label: 'Só a ideia', text: 'Só a ideia', points: 0,
              keywords: ['ideia', 'nao comecei', 'comecando', 'do zero'],
              react: 'Começar do zero tem uma vantagem: dá pra desenhar certo desde a pergunta.' },
            { value: 'protocolo', label: 'Protocolo pronto', text: 'Protocolo pronto', points: 1,
              keywords: ['protocolo', 'prospero', 'projeto pronto'],
              react: 'Protocolo pronto já é meio caminho. Muita gente trava antes disso.' },
            { value: 'dados_coletados', label: 'Dados coletados', text: 'Dados coletados', points: 3,
              keywords: ['dados', 'coletad', 'coleta'],
              react: 'Dados na mão é a fase em que mais dá pra ganhar (ou perder) na análise.' },
            { value: 'manuscrito', label: 'Manuscrito escrito', text: 'Manuscrito escrito', points: 3,
              keywords: ['manuscrito', 'escrito', 'artigo pronto', 'texto pronto'],
              react: 'Manuscrito pronto, ótimo. Aí o trabalho é outro: deixar à prova de revisor.' },
            { value: 'rejeitado', label: 'Já submetido e rejeitado', text: 'Já submeti e foi rejeitado', points: 3,
              keywords: ['rejeit', 'recusad', 'submeti', 'submetido', 'reprovad'],
              react: 'Rejeição acontece com todo mundo, inclusive comigo. O parecer do revisor ajuda muito a saber o que corrigir.',
              extra: 'Se tiver o parecer dos revisores, pode me mandar aqui depois. Ajuda bastante na conversa.' },
        ],
    },
    tipo_estudo: {
        sheet: 'Tipo de estudo',
        intro: 'E que tipo de estudo é?',
        options: [
            { value: 'revisao_meta', label: 'Revisão sistemática ou meta-análise', text: 'Revisão sistemática ou meta-análise',
              keywords: ['revisao', 'meta', 'sistematica', 'scoping', 'umbrella'],
              react: 'Revisão sistemática é a minha praia. É o que eu mais faço.' },
            { value: 'ensaio_clinico', label: 'Ensaio clínico', text: 'Ensaio clínico',
              keywords: ['ensaio', 'clinico', 'randomizad', 'rct'],
              react: 'Ensaio clínico pede cuidado redobrado com CONSORT e com a análise. Bom saber.' },
            { value: 'observacional', label: 'Estudo observacional', text: 'Estudo observacional',
              keywords: ['observacional', 'coorte', 'transversal', 'caso controle', 'caso-controle', 'retrospectiv'],
              react: 'Observacional bem feito publica muito bem. O segredo costuma estar no controle de confusão.' },
            { value: 'nao_sei', label: 'Ainda não sei', text: 'Ainda não sei',
              keywords: ['nao sei', 'nao tenho certeza', 'sei la', 'nao defini'],
              react: 'Tranquilo, isso a gente define junto. Às vezes a pergunta de pesquisa já aponta o desenho.' },
        ],
    },
    estagio: {
        sheet: 'Estágio',
        intro: 'Agora sobre você, {nome}. Qual o seu momento hoje?',
        react: 'Entendi.',
        options: [
            { value: 'graduando', label: 'Graduando', text: 'Graduação', points: -3, exit: 'C',
              keywords: ['graduacao', 'graduando', 'graduanda', 'faculdade', 'tcc', 'iniciacao'] },
            { value: 'pos_graduando', label: 'Pós-graduando (mestrado ou doutorado)', text: 'Mestrado ou doutorado', points: 2,
              keywords: ['mestrado', 'mestrando', 'mestranda', 'doutorado', 'doutorando', 'doutoranda', 'pos-graduacao', 'pos graduacao'] },
            { value: 'pos_doutorando', label: 'Pós-doutorando', text: 'Pós-doutorado', points: 2,
              keywords: ['pos-doc', 'pos doc', 'posdoc', 'pos-doutorado', 'pos doutorado', 'pos-doutorando'] },
            { value: 'professor_progressao', label: 'Professor/pesquisador em progressão de carreira', text: 'Professor(a) ou pesquisador(a) em progressão de carreira', points: 2,
              keywords: ['progressao', 'professor', 'professora', 'docente'] },
            { value: 'professor_titular', label: 'Professor titular / pesquisador sênior', text: 'Professor(a) titular ou pesquisador(a) sênior', points: 2,
              keywords: ['professor titular', 'professora titular', 'pesquisador senior', 'pesquisadora senior', 'titular', 'senior'] },
            { value: 'fora_academia', label: 'Profissional fora da academia', text: 'Profissional fora da academia (clínica, hospital, consultório)', points: 2,
              keywords: ['fora da academia', 'clinica', 'hospital', 'consultorio', 'medico', 'medica'] },
            { value: 'outro', label: 'Outro', text: 'Outro', points: 0, keywords: ['outro'] },
        ],
    },
    area: {
        sheet: 'Área',
        intro: 'Qual a sua área de formação?',
        options: [
            { value: 'medicina',        label: 'Medicina',             text: 'Medicina',             points: 1, keywords: ['medicina', 'medico', 'medica'] },
            { value: 'fisioterapia',    label: 'Fisioterapia',         text: 'Fisioterapia',         points: 1, keywords: ['fisio'] },
            { value: 'odontologia',     label: 'Odontologia',          text: 'Odontologia',          points: 1, keywords: ['odonto', 'dentista'] },
            { value: 'nutricao',        label: 'Nutrição',             text: 'Nutrição',             points: 1, keywords: ['nutri'] },
            { value: 'enfermagem',      label: 'Enfermagem',           text: 'Enfermagem',           points: 1, keywords: ['enferm'] },
            { value: 'educacao_fisica', label: 'Educação física',      text: 'Educação física',      points: 1, keywords: ['educacao fisica', 'ed fisica', 'ed. fisica', 'educador fisico'] },
            { value: 'farmacia',        label: 'Farmácia',             text: 'Farmácia',             points: 1, keywords: ['farmac'] },
            { value: 'psicologia',      label: 'Psicologia',           text: 'Psicologia',           points: 1, keywords: ['psicolog'] },
            { value: 'outra_saude',     label: 'Outra área da saúde',  text: 'Outra área da saúde',  points: 1,
              keywords: ['outra area da saude', 'biomedicina', 'biomedic', 'fonoaudiolog', 'terapia ocupacional', 'veterinar', 'saude publica', 'biolog'] },
            { value: 'fora_saude',      label: 'Fora da área da saúde', text: 'Fora da área da saúde', points: 0, exit: 'D',
              keywords: ['fora da area', 'fora da saude', 'nao e da saude', 'engenharia', 'direito', 'administracao', 'economia'] },
        ],
    },
    objetivo: {
        sheet: 'Objetivo',
        intro: 'E o que você quer com esse estudo? O que pesa mais hoje?',
        options: [
            { value: 'requisito_academico', label: 'Concluir um requisito acadêmico (TCC, dissertação, tese)', text: 'Concluir um requisito (TCC, dissertação, tese)', points: 1,
              keywords: ['requisito', 'dissertacao', 'tese', 'tcc', 'defesa', 'qualificacao', 'banca'],
              react: 'Então tem banca no meio. Vou levar isso em conta.' },
            { value: 'progressao_carreira', label: 'Progressão de carreira (titularidade, fomento, currículo)', text: 'Progressão de carreira (concurso, titularidade, fomento, currículo)', points: 2,
              keywords: ['progressao', 'carreira', 'concurso', 'titularidade', 'fomento', 'curriculo', 'lattes'],
              react: 'Faz sentido. Publicação boa conta muito nessa hora.' },
            { value: 'qualidade_metodologica', label: 'Melhorar a qualidade metodológica de uma pesquisa', text: 'Melhorar a qualidade metodológica da pesquisa', points: 0,
              keywords: ['qualidade', 'metodolog', 'melhorar'],
              react: 'Gosto disso. Método bem feito é o que segura o artigo na revisão.' },
            { value: 'alto_impacto_q1', label: 'Publicar em revista de alto impacto (Q1)', text: 'Publicar em revista de alto impacto (Q1)', points: 2,
              keywords: ['q1', 'alto impacto', 'impacto', 'revista boa'],
              react: 'Q1 é exigente, mas é possível. Já publicamos em várias.' },
            { value: 'outro', label: 'Outro', text: 'Outro', points: 0, keywords: ['outro'],
              react: 'Beleza, a gente conversa sobre isso.' },
        ],
    },
    prazo: {
        sheet: 'Prazo',
        intro: 'Última de múltipla escolha, prometo 😄\nQual é o seu prazo?',
        options: [
            { value: 'ate_3_meses', label: 'Até 3 meses', text: 'Até 3 meses', points: 2,
              keywords: ['ate 3', '3 meses', 'tres meses', '1 mes', 'um mes', '2 meses', 'dois meses', 'urgente', 'semanas'] },
            { value: '3_a_6_meses', label: '3 a 6 meses', text: 'De 3 a 6 meses', points: 2,
              keywords: ['3 a 6', 'de 3 a 6', '4 meses', '5 meses', '6 meses', 'seis meses', 'semestre'] },
            { value: 'mais_6_meses', label: 'Mais de 6 meses', text: 'Mais de 6 meses', points: 0,
              keywords: ['mais de 6', 'mais de seis', '1 ano', 'um ano', 'ano que vem', 'proximo ano', '2 anos'] },
            { value: 'sem_prazo', label: 'Sem prazo definido', text: 'Sem prazo definido', points: 0,
              keywords: ['sem prazo', 'nao tenho prazo', 'nao tem prazo', 'nao sei', 'indefinido'] },
        ],
    },
};

// ============================================
// TEXTOS E ÁUDIOS — edite aqui. {nome} vira o primeiro nome do lead.
// Cada áudio tem o texto que vai por escrito enquanto o arquivo não existir.
// ============================================

const FUNIL_COPY = {
    welcome:  'Oi! Aqui é o Gaspar, do SIPOP 👋\nQue bom que você chamou.',
    askName:  'Pra começar: como você prefere que eu te chame?',
    niceToMeet:       'Prazer, {nome}!',
    niceToMeetNoName: 'Prazer!',

    askDetails: 'Se quiser, me conta em poucas palavras o tema do estudo. Pode ser por áudio mesmo, eu escuto.\nSe preferir pular, é só mandar *pular*.',
    thanks:     'Obrigado, {nome}. Deixa eu dar uma olhada aqui no que você me contou…',

    askConfirmB: 'Você quer começar a trabalhar nesse estudo nas próximas semanas?\n\n1️⃣ Sim, quero começar agora\n2️⃣ Ainda estou só pesquisando',

    askEmail:    'Pra eu te mandar o convite da reunião (Google Meet), qual o seu melhor e-mail?',
    badEmail:    'Acho que faltou alguma coisa nesse e-mail. Pode conferir?',
    link:        'Perfeito. Aqui está o link pra você escolher o melhor dia e horário:\n👉 {link}\n\nLeva menos de um minuto. Assim que você marcar, chega a confirmação aqui e no seu e-mail.',

    publications: 'Enquanto isso, olha alguns dos estudos que apoiamos recentemente:\n\n' +
        '• _The clinical spectrum of suicide-related outcomes in amyotrophic lateral sclerosis_ (General Hospital Psychiatry, 2026)\n' +
        '• _SGLT2 Inhibitors and Nephrolithiasis Risk in Adults With Type 2 Diabetes_ (Endocrine Practice, 2026)\n' +
        '• _Body Composition Remodelling During GLP-1-Based Therapy_ (Diabetes, Obesity and Metabolism, 2026)\n' +
        '• _Contemporary Initial Glucose-Lowering Strategies for Type 2 Diabetes_ (Diabetes, Obesity and Metabolism, 2026)\n\n' +
        'Todos em https://sipopscience.com/pt/publications',
    closingC:  'Qualquer dúvida, é só me chamar por aqui. 🙂',
    routeD:    'Obrigado por me contar, {nome}. Preciso ser sincero com você: o SIPOP trabalha só com ciências biomédicas e da saúde, que é onde a gente domina o método e as revistas.\nPra não te fazer perder tempo, prefiro te avisar já. Se um dia você tiver um estudo na área da saúde, me chama aqui!',

    notUnderstood:      'Não entendi muito bem 😅 Pode responder só com o número da opção?',
    notUnderstoodAudio: 'Pra eu registrar certinho, me responde só com o número da opção 🙂',
    handoff:            'Vou chamar alguém da equipe pra te ajudar por aqui. Em horário comercial a resposta é rápida 🙂',
    handoffAsked:       'Claro! Vou chamar alguém da equipe pra falar com você aqui mesmo. Em horário comercial a resposta é rápida.',
    handoffAfter:       'Vou pedir pra alguém da equipe te responder por aqui, tá? 🙂',

    // Follow-ups
    f1: 'Oi, {nome}, ainda está por aí? Faltam só umas perguntinhas pra eu entender o seu caso. 🙂',
    f3: '{nome}, vou deixar sua avaliação em aberto por aqui. Quando quiser continuar, é só mandar *continuar*.',
    fa1: '{nome}, conseguiu escolher um horário? Se nenhum dos horários do link der certo pra você, me fala um dia e período que eu tento encaixar.',
    fa2Image: 'E tem um bônus: ao final da reunião, você ganha este e-book. 📘',
    fa3: 'Última mensagem sobre isso, prometo 😄 O link pra marcar a conversa segue aqui: {link}\nSe o momento não for agora, sem problema nenhum.',
};

const FUNIL_AUDIOS = {
    A1: 'Oi, tudo bem? Aqui é o Gaspar. Antes de qualquer coisa, deixa eu te explicar como funciona: eu vou te fazer umas perguntas rápidas sobre o seu estudo. Leva uns dois minutos. Com isso eu já consigo entender em que fase você está e qual formato de acompanhamento faz sentido pro seu prazo. Aí, se fizer sentido, a gente marca uma conversa de uns vinte minutos pra eu olhar o seu caso com calma. Bora?',
    A2a: 'Olha, pelo que você me contou, o seu caso tem tudo pra dar certo. Nessa fase, o que mais faz diferença é acertar a pergunta e o protocolo antes de sair buscando. É aí que a maioria erra e só descobre lá na frente, com o revisor. Eu queria olhar isso com você numa conversa rápida, uns vinte minutos, por vídeo. Sem compromisso. Vou te mandar o link pra você escolher o horário.',
    A2b: 'Olha, pelo que você me contou, o seu caso tem bastante potencial. Você já tem os dados, que é a parte mais difícil de conseguir. Agora o ponto é a análise: é aí que um revisor de revista boa costuma pegar. Eu queria olhar isso com você numa conversa de uns vinte minutos, por vídeo, sem compromisso. Já te mando o link pra escolher o horário.',
    A2c: 'Pelo que você me contou, você está muito perto. Manuscrito pronto, agora é deixar ele à prova de revisor: método, estatística, PRISMA, CONSORT, o que for o caso. Eu faço revisão pra mais de trinta revistas, então sei bem o que eles procuram. Vamos conversar uns vinte minutos por vídeo? Eu te mando o link pra você escolher o horário.',
    A2d: 'Rejeição não é o fim, tá? Muitas vezes o estudo é bom e o problema está na forma de apresentar o método ou a análise. Se você tiver o parecer dos revisores, traz pra conversa, que eu já olho junto. São uns vinte minutos por vídeo, sem compromisso. Vou te mandar o link pra escolher o horário.',
    A3: 'Olha, obrigado por me contar tudo isso. Pelo que entendi, o seu estudo ainda está numa fase mais inicial, e isso não é problema nenhum. Só quero te explicar que o nosso acompanhamento é próximo, com reuniões e prazos, então funciona melhor pra quem quer começar agora. Se esse é o seu momento, a gente marca uma conversa rápida pra eu entender melhor o seu caso.',
    A4: 'Valeu demais por ter me chamado. Pelo momento em que você está, acho que uma reunião agora ainda não é o melhor caminho. Mas eu não quero te deixar na mão: vou te mandar alguns estudos nossos pra você ver como a gente trabalha. E quando o seu estudo andar, me chama de novo aqui, que eu vou adorar ajudar.',
    A5: 'Oi, é o Gaspar de novo. Imagino que a correria bateu aí. Quando tiver um minutinho, me responde a última pergunta que eu te mandei, que eu já consigo te dizer o melhor caminho pro seu estudo.',
    A6: 'Oi, é o Gaspar. Separei um horário pra gente conversar sobre o seu estudo, mas vi que você ainda não marcou. Não precisa se preocupar em ter tudo pronto, tá? A ideia da conversa é justamente eu te ajudar a organizar. O link continua valendo.',
    A7: 'Eu sou fisioterapeuta, me formei na Federal de Santa Maria, e hoje sou revisor de trinta revistas internacionais da área da saúde. No SIPOP, a gente ajuda pesquisadores a publicar com o rigor que essas revistas pedem. Tem bastante estudo nosso publicado esse ano, se quiser eu te mando alguns.',
};

// Áudio da Rota A conforme a fase do estudo
const FUNIL_ROUTE_A_AUDIO = { ideia: 'A2a', protocolo: 'A2a', dados_coletados: 'A2b', manuscrito: 'A2c', rejeitado: 'A2d' };

// Perguntas fora do roteiro (respondidas em qualquer etapa; depois o bot repete a pergunta)
const FUNIL_FAQ = [
    { keywords: ['preco', 'valor', 'quanto custa', 'quanto e', 'quanto fica', 'investimento', 'custo', 'orcamento', 'mensalidade'],
      text: 'Depende muito do formato e da fase do estudo, por isso eu prefiro entender seu caso antes de falar em valor. Na conversa eu já te passo tudo certinho.' },
    { keywords: ['voces escrevem', 'escreve o artigo', 'escrevem o artigo', 'fazem o artigo', 'fazer o artigo', 'faz o artigo', 'fazem pra mim', 'faz pra mim', 'escrever pra mim'],
      text: 'Não. A gente orienta, revisa e audita. O texto e a autoria são seus. É assim que tem que ser.' },
    { keywords: ['garant'],
      text: 'Ninguém pode garantir publicação, e desconfie de quem garante. O que eu garanto é que o método vai estar no padrão que os revisores exigem.' },
    { keywords: ['como funciona', 'e online', 'presencial', 'como e o atendimento'],
      text: 'É tudo online, com reuniões periódicas em etapas: planejamento, desenvolvimento e revisão.' },
    { keywords: ['quem e voce', 'quem e o gaspar', 'quem esta falando', 'com quem eu falo', 'com quem falo', 'e um robo', 'e robo', 'e bot'],
      audio: 'A7' },
    { keywords: ['publicacoes', 'exemplos', 'artigos de voces', 'estudos de voces', 'portfolio'],
      textKey: 'publications' },
];

const FUNIL_HANDOFF_KEYWORDS = ['atendente', 'humano', 'falar com alguem', 'falar com uma pessoa', 'pessoa real',
    'falar com voce', 'falar com o gaspar', 'me liga', 'pode me ligar', 'ligacao'];

// Etapas em que o bot está fazendo perguntas (o resto é fim de roteiro)
const FUNIL_ASK_STEPS = ['nome'].concat(FUNIL_ORDER, ['detalhes', 'confirma_b', 'email']);

// ============================================
// Lógica da conversa (funções puras: não tocam em planilha nem em rede)
// ============================================

function funilNorm_(value) {
    return String(value || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();
}

function funilIsDate_(value) {
    return Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
}

function funilFirstName_(value) {
    const first = String(value || '').trim().split(/\s+/)[0] || '';
    if (!/[a-zA-ZÀ-ÿ]/.test(first)) return '';
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function funilFill_(text, s) {
    return String(text)
        .replace(/\{nome\}, /g, s.name ? s.name + ', ' : '')
        .replace(/, \{nome\}/g, s.name ? ', ' + s.name : '')
        .replace(/\{nome\}/g, s.name || '')
        .replace(/\{link\}/g, s.link || '')
        .replace(/^\s+/, '').replace(/^(\S)/, function (c) { return c.toUpperCase(); });
}

// "kw" aparece no começo de uma palavra do texto (aceita sufixo: "coletad" casa "coletados")
function funilHasKeyword_(normText, keyword) {
    const kw = funilNorm_(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + kw).test(normText);
}

// Opção escolhida (objeto) ou null. Palavra-chave mais longa vence; número só se não houver palavra.
function funilMatchOption_(options, raw) {
    const text = funilNorm_(raw).replace(/️|⃣/g, '').replace(/🔟/g, '10');
    if (!text) return null;

    let best = null;
    let bestLen = 0;
    let tie = false;
    options.forEach(function (option) {
        (option.keywords || []).forEach(function (kw) {
            const len = funilNorm_(kw).length;
            if (!funilHasKeyword_(text, kw)) return;
            if (len > bestLen) { best = option; bestLen = len; tie = false; }
            else if (len === bestLen && best !== option) tie = true;
        });
    });
    if (best && !tie) return best;

    const words = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
    const stripped = text.replace(/^(?:(?:opcao|numero|letra|n[º°o]?)\s*[:.\-]?\s*|[aoe]\s+|#\s*)/, '');
    const m = stripped.match(/^(\d{1,2})(?!\d)/);
    const n = m ? Number(m[1]) : (words[stripped.replace(/[.!]+$/, '')] || 0);
    return n >= 1 && n <= options.length ? options[n - 1] : null;
}

function funilExtractEmail_(raw) {
    const m = String(raw || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return m ? m[0].toLowerCase() : '';
}

// "Me chamo Ana Paula" -> "Ana". Devolve '' se não parecer um nome.
function funilExtractName_(raw) {
    let text = String(raw || '').trim()
        .replace(/[!?.,;]+/g, ' ')
        .replace(/^(oi|ola|olá|bom dia|boa tarde|boa noite)\s+/i, '')
        .replace(/^(meu nome (e|é)|me chamo|eu sou( a| o)?|sou( a| o)?|pode me chamar de|me chama de|aqui (e|é)( a| o)?)\s+/i, '')
        .replace(/^(dra?|dr\.|dra\.|prof|profa|professora?|doutora?)\s+/i, '')
        .trim();
    if (!text || text.split(/\s+/).length > 6 || /\d|@|http/.test(text)) return '';
    return funilFirstName_(text);
}

function funilQuestionText_(key, s) {
    const q = FUNIL_QUESTIONS[key];
    const lines = q.options.map(function (o, i) { return FUNIL_EMOJI_NUMBERS[i] + ' ' + o.text; });
    return funilFill_(q.intro, s) + '\n\n' + lines.join('\n') + (q.hint ? '\n\n' + q.hint : '');
}

// Ações que (re)fazem a pergunta da etapa atual.
function funilAskActions_(s) {
    if (s.step === 'nome')       return [{ type: 'text', text: FUNIL_COPY.askName }];
    if (FUNIL_QUESTIONS[s.step]) return [{ type: 'text', text: funilQuestionText_(s.step, s) }];
    if (s.step === 'detalhes')   return [{ type: 'text', text: FUNIL_COPY.askDetails }];
    if (s.step === 'confirma_b') return [{ type: 'text', text: FUNIL_COPY.askConfirmB }];
    if (s.step === 'email')      return [{ type: 'text', text: FUNIL_COPY.askEmail }];
    if (s.step === 'link')       return [{ type: 'text', text: funilFill_(FUNIL_COPY.link, s) }];
    return [];
}

function funilScore_(answers) {
    return FUNIL_ORDER.reduce(function (total, key) {
        const option = FUNIL_QUESTIONS[key].options.filter(function (o) { return o.value === answers[key]; })[0];
        return total + (option && option.points ? option.points : 0);
    }, 0);
}

function funilOptionLabel_(key, value) {
    const option = FUNIL_QUESTIONS[key].options.filter(function (o) { return o.value === value; })[0];
    return option ? option.label : '';
}

// Processa uma mensagem do lead. Altera `s` e devolve
// { actions: [...], events: [...] } — os eventos são tratados por quem chama:
//   { type: 'lead', fields }         atualizar a linha do lead na aba de contatos
//   { type: 'summary', qualified }   gravar o resumo "Nota do lead: …"
//   { type: 'qualified' }            avisar a equipe (lead qualificado)
//   { type: 'handoff', reason }      pausar o bot e avisar a equipe
function funilTransition_(s, inbound) {
    const out = { actions: [], events: [] };
    const text  = inbound.kind === 'text' ? String(inbound.text || '') : '';
    const norm  = funilNorm_(text);
    const say   = function (t, delay) { out.actions.push({ type: 'text', text: funilFill_(t, s), delay: delay }); };
    const audio = function (id) { out.actions.push({ type: 'audio', id: id, text: FUNIL_AUDIOS[id] }); };
    const pause = function (ms) { out.actions.push({ type: 'pause', ms: ms }); };
    const ask   = function () { out.actions = out.actions.concat(funilAskActions_(s)); };
    const handoff = function (message, reason) {
        say(message);
        s.paused = reason;
        out.events.push({ type: 'handoff', reason: reason });
    };

    if (s.step === 'inicio') {
        say(FUNIL_COPY.welcome, FUNIL.SHORT_TYPING_MS);
        audio('A1');
        s.step = 'nome';
        ask();
        return out;
    }

    const asking = FUNIL_ASK_STEPS.indexOf(s.step) !== -1;

    // Pedido de atendente vale em qualquer etapa (em "detalhes", só em mensagem curta:
    // "comportamento humano" é tema de estudo, não pedido de atendente)
    const shortMessage = norm.split(' ').length <= 6;
    if (norm && (s.step !== 'detalhes' || shortMessage) && FUNIL_HANDOFF_KEYWORDS.some(function (kw) { return funilHasKeyword_(norm, kw); })) {
        handoff(FUNIL_COPY.handoffAsked, 'Pediu atendente');
        return out;
    }

    // Fim do roteiro: agradecimento não pede resposta; o resto passa para a equipe
    if (!asking && /^(ok|okay|blz|beleza|valeu|obrigad[oa]s?|muito obrigad[oa]|show|perfeito|otimo|combinado|certo|top|👍|🙏|❤️|😊|🙂)[!. ]*$/.test(norm)) {
        return out;
    }
    if (!asking) {
        handoff(FUNIL_COPY.handoffAfter, 'Escreveu depois do fim do roteiro');
        return out;
    }

    if (norm === 'continuar') { ask(); return out; }

    // Perguntas fora do roteiro (no nome e nos detalhes, só se for pergunta mesmo)
    const faqAllowed = norm && (['nome', 'detalhes', 'email'].indexOf(s.step) === -1 || text.indexOf('?') !== -1);
    const faq = faqAllowed && FUNIL_FAQ.filter(function (f) {
        return f.keywords.some(function (kw) { return funilHasKeyword_(norm, kw); });
    })[0];
    if (faq) {
        if (faq.audio) audio(faq.audio);
        else say(faq.textKey ? FUNIL_COPY[faq.textKey] : faq.text);
        ask();
        return out;
    }

    const invalid = function () {
        s.invalid = (Number(s.invalid) || 0) + 1;
        if (s.invalid >= 2) { handoff(FUNIL_COPY.handoff, 'Não entendeu as perguntas'); return; }
        say(inbound.kind === 'audio' ? FUNIL_COPY.notUnderstoodAudio : FUNIL_COPY.notUnderstood, FUNIL.SHORT_TYPING_MS);
    };

    if (s.step === 'nome') {
        s.name = funilExtractName_(text) || funilFirstName_(s.pushName);
        s.answers.nome_resposta = text || '[' + inbound.kind + ']';
        say(s.name ? FUNIL_COPY.niceToMeet : FUNIL_COPY.niceToMeetNoName, FUNIL.SHORT_TYPING_MS);
        if (s.name) out.events.push({ type: 'lead', fields: { name: s.name } });
        s.step = FUNIL_ORDER[0];
        ask();
        return out;
    }

    if (FUNIL_QUESTIONS[s.step]) {
        const key = s.step;
        const q = FUNIL_QUESTIONS[key];
        const option = funilMatchOption_(q.options, text);
        if (!option) { invalid(); return out; }

        s.invalid = 0;
        s.answers[key] = option.value;
        if (option.react || q.react) say(option.react || q.react, FUNIL.SHORT_TYPING_MS);
        if (option.extra) say(option.extra);

        if (option.exit === 'C') return funilRouteC_(s, out, say, audio);
        if (option.exit === 'D') return funilRouteD_(s, out, say);

        const next = FUNIL_ORDER[FUNIL_ORDER.indexOf(key) + 1];
        s.step = next || 'detalhes';
        ask();
        return out;
    }

    if (s.step === 'detalhes') {
        if (inbound.kind === 'timeout' || norm === 'pular' || norm === 'nao' || norm === 'nao quero') s.answers.detalhes = '';
        else s.answers.detalhes = inbound.combined || text || '[' + inbound.kind + ' recebido no WhatsApp]';
        say(FUNIL_COPY.thanks, FUNIL.SHORT_TYPING_MS);
        pause(FUNIL.THINKING_MS);

        s.score = funilScore_(s.answers);
        if (s.score >= FUNIL.CUTOFF) return funilRouteA_(s, out, audio);
        if (s.score >= FUNIL.WARM_MIN) {
            s.route = 'B (aguardando)';
            out.events.push({ type: 'summary', qualified: false });
            audio('A3');
            s.step = 'confirma_b';
            ask();
            return out;
        }
        return funilRouteC_(s, out, say, audio);
    }

    if (s.step === 'confirma_b') {
        const option = funilMatchOption_([
            { value: 'sim', keywords: ['sim', 'quero', 'agora', 'bora', 'vamos', 'claro', 'com certeza', 'pode ser'] },
            { value: 'nao', keywords: ['pesquisando', 'ainda nao', 'nao', 'depois', 'mais pra frente', 'so pesquisando'] },
        ], text);
        if (!option) { invalid(); return out; }
        s.invalid = 0;
        if (option.value === 'nao') return funilRouteC_(s, out, say, audio);
        s.route = 'B';
        out.events.push({ type: 'summary', qualified: true });
        out.events.push({ type: 'qualified' });
        s.step = 'email';
        ask();
        return out;
    }

    if (s.step === 'email') {
        const email = funilExtractEmail_(text);
        if (!email) {
            s.invalid = (Number(s.invalid) || 0) + 1;
            if (s.invalid < 3) { say(FUNIL_COPY.badEmail, FUNIL.SHORT_TYPING_MS); return out; }
        } else {
            s.email = email;
            out.events.push({ type: 'lead', fields: { email: email } });
        }
        s.invalid = 0;
        s.step = 'link';
        ask();
        return out;
    }

    return out;
}

function funilRouteA_(s, out, audio) {
    s.route = 'A';
    out.events.push({ type: 'summary', qualified: true });
    out.events.push({ type: 'qualified' });
    audio(FUNIL_ROUTE_A_AUDIO[s.answers.fase] || 'A2b');
    s.step = 'email';
    out.actions = out.actions.concat(funilAskActions_(s));
    return out;
}

function funilRouteC_(s, out, say, audio) {
    s.score = funilScore_(s.answers);
    s.route = 'C';
    out.events.push({ type: 'summary', qualified: false });
    audio('A4');
    say(FUNIL_COPY.publications);
    say(FUNIL_COPY.closingC, FUNIL.SHORT_TYPING_MS);
    s.step = 'encerrado';
    return out;
}

function funilRouteD_(s, out, say) {
    s.score = funilScore_(s.answers);
    s.route = 'D';
    out.events.push({ type: 'summary', qualified: false });
    say(FUNIL_COPY.routeD);
    s.step = 'encerrado';
    return out;
}

// Follow-up devido agora para uma conversa parada: ações ou null. Altera s.fu.
function funilFollowUpActions_(s, now) {
    if (s.paused || !(funilIsDate_(s.lastOut))) return null;
    const lastIn = funilIsDate_(s.lastIn) ? s.lastIn.getTime() : 0;
    if (lastIn > s.lastOut.getTime()) return null; // o lead respondeu por último
    const minutes = (now.getTime() - s.lastOut.getTime()) / 60000;
    const done = Number(s.fu) || 0;

    const asking = FUNIL_ASK_STEPS.indexOf(s.step) !== -1 && s.step !== 'detalhes';
    const plan = asking ? FUNIL.FOLLOWUP_ASK_MIN : s.step === 'link' ? FUNIL.FOLLOWUP_LINK_MIN : null;
    if (!plan || done >= plan.length) return null;
    // Cada lembrete conta a partir da última mensagem do bot (que pode ser o lembrete anterior)
    const gap = plan[done] - (done ? plan[done - 1] : 0);
    if (minutes < gap) return null;

    const t = function (key) { return { type: 'text', text: funilFill_(FUNIL_COPY[key], s) }; };
    let actions;
    if (asking) {
        if (done === 0) actions = [t('f1')].concat(funilAskActions_(s));
        else if (done === 1) actions = [{ type: 'audio', id: 'A5', text: FUNIL_AUDIOS.A5 }];
        else actions = [t('f3')];
    } else {
        if (done === 0) actions = [t('fa1')];
        else if (done === 1) actions = [{ type: 'audio', id: 'A6', text: FUNIL_AUDIOS.A6 }, { type: 'ebook', caption: FUNIL_COPY.fa2Image }];
        else actions = [t('fa3')];
    }
    s.fu = done + 1;
    return actions;
}

// Texto do resumo no mesmo formato da LP (o splitDetails separa em colunas).
function funilSummary_(s, qualified) {
    const a = s.answers || {};
    const label = function (key) { return a[key] ? funilOptionLabel_(key, a[key]) : '—'; };
    return [
        'Nota do lead: ' + (Number(s.score) || 0) + ' (qualificado: ' + (qualified ? 'sim' : 'não') + ')',
        'Instagram: —',
        'Fase: ' + label('fase'),
        'Tipo de estudo: ' + label('tipo_estudo'),
        'Prazo: ' + label('prazo'),
        'Detalhes: ' + (a.detalhes || '—'),
        'utm_term: —',
        'gclid: —',
        'fbclid: —',
        'Página: WhatsApp (' + (s.origin || 'orgânico') + ')',
        'event_id: wa-' + s.key,
    ].join('\n');
}

function funilOriginOf_(text) {
    const norm = funilNorm_(text);
    const hit = FUNIL.ORIGINS.filter(function (o) { return norm.indexOf(funilNorm_(o[0])) !== -1; })[0];
    return hit ? hit[1] : 'orgânico';
}

// ============================================
// Webhook da Evolution API (chamado pelo doPost do apps-script.gs)
// ============================================

function funilIsWebhook_(data) {
    return Boolean(data && data.event && data.instance && data.data);
}

function funilHandleWebhook_(e, data) {
    try {
        const secret = PropertiesService.getScriptProperties().getProperty('FUNIL_WEBHOOK_SECRET');
        const given  = (e && e.parameter && e.parameter.funil) || '';
        if (!secret || given !== secret) {
            Logger.log('funil: webhook recusado (FUNIL_WEBHOOK_SECRET ausente ou diferente).');
        } else if (funilNorm_(data.event).replace(/[._\s]/g, '') === 'messagesupsert') {
            (Array.isArray(data.data) ? data.data : [data.data]).forEach(funilOnMessage_);
        }
    } catch (error) {
        Logger.log('funil: erro no webhook: ' + (error && error.stack || error));
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
}

function funilOnMessage_(m) {
    if (!m || !m.key) return;
    const jid = String(m.key.remoteJid || '');
    if (!/@(s\.whatsapp\.net|lid)$/.test(jid)) return; // grupos, status, canais

    // A Evolution pode repetir o webhook: cada mensagem é tratada uma vez só
    const cache = CacheService.getScriptCache();
    if (m.key.id) {
        if (cache.get('funil-in-' + m.key.id)) return;
        cache.put('funil-in-' + m.key.id, '1', 21600);
    }

    const contact = funilContactOf_(m);
    if (!contact.key) return;

    if (m.key.fromMe) {
        if (m.key.id && cache.get('funil-out-' + m.key.id)) return; // mandada pelo bot
        funilOnTeamMessage_(contact);
        return;
    }
    funilProcess_(contact, funilParseInbound_(m));
}

// { key, phone (só dígitos ou ''), to (número ou JID para responder), pushName }
function funilContactOf_(m) {
    const jid = String(m.key.remoteJid || '');
    let phone = '';
    if (/@s\.whatsapp\.net$/.test(jid)) {
        phone = jid.split('@')[0].split(':')[0];
    } else {
        const alt = String(m.key.remoteJidAlt || m.key.senderPn || m.remoteJidAlt || '');
        if (/@s\.whatsapp\.net$/.test(alt)) phone = alt.split('@')[0].split(':')[0];
    }
    phone = phone.replace(/\D/g, '');
    return { key: phone || jid, phone: phone, to: phone || jid, pushName: String(m.pushName || '') };
}

function funilParseInbound_(m) {
    const msg = m.message || {};
    const text = msg.conversation ||
        (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
        (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedDisplayText) ||
        (msg.listResponseMessage && msg.listResponseMessage.title) ||
        (msg.templateButtonReplyMessage && msg.templateButtonReplyMessage.selectedDisplayText) ||
        (msg.imageMessage && msg.imageMessage.caption) ||
        (msg.documentMessage && msg.documentMessage.caption) || '';
    let kind = 'text';
    if (!text) {
        if (msg.audioMessage || m.messageType === 'audioMessage') kind = 'audio';
        else kind = 'media';
    }
    const ts = Number(m.messageTimestamp) ? new Date(Number(m.messageTimestamp) * 1000) : new Date();
    return { kind: kind, text: String(text), at: new Date(Math.min(ts.getTime(), Date.now())).toISOString() };
}

function funilShouldStart_(contact, inbound) {
    const props = PropertiesService.getScriptProperties();
    const only  = String(props.getProperty('FUNIL_SO_NUMEROS') || '').split(',')
        .map(function (n) { return n.replace(/\D/g, ''); }).filter(String);
    if (only.length) return only.some(function (n) { return funilPhoneVariants_(n).indexOf(contact.phone) !== -1; });
    if (funilNorm_(props.getProperty('FUNIL_ENTRADA')) === 'todos') return !funilIsKnownLead_(contact.phone);
    return inbound.kind === 'text' && funilNorm_(inbound.text).indexOf(FUNIL.ENTRY_TEXT) !== -1;
}

// O WhatsApp identifica alguns celulares brasileiros sem o 9º dígito (55 51 91078194).
// Devolve o número como foi digitado e a outra forma (com ou sem o 9).
function funilPhoneVariants_(number) {
    const n = String(number || '').replace(/\D/g, '');
    if (!/^55\d{10,11}$/.test(n)) return [n];
    const ddd = n.slice(2, 4), local = n.slice(4);
    if (local.length === 9 && local[0] === '9') return [n, '55' + ddd + local.slice(1)];
    if (local.length === 8 && /^[6-9]/.test(local)) return [n, '55' + ddd + '9' + local];
    return [n];
}

// No modo "todos": quem já é lead do formulário não entra no funil (a equipe já fala com ele).
function funilIsKnownLead_(phone) {
    if (!phone) return false;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) return false;
    const local = phone.replace(/^55/, '').slice(-8); // últimos 8 dígitos bastam e ignoram o 9º dígito
    const hits = sheet.createTextFinder(local.slice(0, 4)).findAll();
    return hits.some(function (cell) { return String(cell.getValue()).replace(/\D/g, '').slice(-8) === local; });
}

// Alguém da equipe escreveu na conversa: o bot sai enquanto estiver perguntando.
function funilOnTeamMessage_(contact) {
    funilWithLock_(function () {
        const s = funilLoad_(contact.key);
        if (!s || s.paused || FUNIL_ASK_STEPS.indexOf(s.step) === -1) return;
        const now = Date.now();
        if (funilIsDate_(s.busyUntil) && s.busyUntil.getTime() > now) return;
        if (funilIsDate_(s.lastOut) && now - s.lastOut.getTime() < FUNIL.HUMAN_GRACE_MS) return;
        s.paused = 'Equipe assumiu a conversa';
        funilSave_(s);
    });
}

// Recebe uma mensagem do lead e conduz a conversa. Mensagens que chegam enquanto o
// bot ainda está respondendo entram na fila e são tratadas em seguida, em ordem.
function funilProcess_(contact, inbound) {
    let s = null;
    let created = false;
    const go = funilWithLock_(function () {
        s = funilLoad_(contact.key);
        if (inbound.kind === 'timeout' && (!s || s.step !== 'detalhes')) return false; // o lead respondeu antes
        if (!s) {
            if (!funilShouldStart_(contact, inbound)) return false;
            s = funilNewState_(contact, inbound);
            created = true;
        }
        if (inbound.kind !== 'timeout') { s.lastIn = new Date(); s.fu = 0; }
        if (contact.phone && !s.phone) s.phone = contact.phone;
        if (s.paused) { funilSave_(s); return false; }
        if (funilIsDate_(s.busyUntil) && s.busyUntil.getTime() > Date.now()) {
            if (inbound.kind !== 'timeout' && s.queue.length < FUNIL.MAX_QUEUE) s.queue.push(inbound);
            funilSave_(s);
            return false;
        }
        s.busyUntil = new Date(Date.now() + FUNIL.BUSY_MS);
        s.queue = [];
        funilSave_(s);
        return true;
    });
    if (!go) return;

    try {
        if (created) funilCreateLead_(s);
        let current = inbound;
        for (let guard = 0; current && guard < FUNIL.MAX_QUEUE; guard++) {
            if (s.step === 'detalhes' && current.kind !== 'timeout' && funilNorm_(current.text) !== 'pular') {
                current = funilAbsorbDetails_(s, current);
            }
            const result = funilTransition_(s, current);
            funilApplyEvents_(s, result.events);
            funilWithLock_(function () { funilMergeFromSheet_(s); funilSave_(s); });
            funilSendActions_(s, result.actions);
            current = funilWithLock_(function () {
                funilMergeFromSheet_(s);
                // Só vale o que chegou depois de a última pergunta começar a ser enviada
                const askedAt = funilIsDate_(s.askedAt) ? s.askedAt.getTime() : 0;
                s.queue = s.queue.filter(function (q) { return new Date(q.at).getTime() >= askedAt - 1000; });
                const next = s.paused ? null : s.queue.shift() || null;
                if (!next) { s.busyUntil = ''; s.queue = []; }
                funilSave_(s);
                return next;
            });
        }
    } catch (error) {
        Logger.log('funil: erro na conversa ' + contact.key + ': ' + (error && error.stack || error));
        funilWithLock_(function () { funilMergeFromSheet_(s); s.busyUntil = ''; funilSave_(s); });
    }
}

// Em "detalhes" o lead costuma mandar mais de uma mensagem (texto + áudio).
// Espera um pouco e junta tudo numa resposta só.
function funilAbsorbDetails_(s, first) {
    Utilities.sleep(FUNIL.DETAILS_GRACE_MS);
    const parts = [first];
    funilWithLock_(function () {
        funilMergeFromSheet_(s);
        while (s.queue.length) parts.push(s.queue.shift());
        funilSave_(s);
    });
    const combined = parts.map(function (p) {
        return p.kind === 'text' ? p.text : '[' + (p.kind === 'audio' ? 'áudio' : 'arquivo') + ' recebido no WhatsApp]';
    }).join('\n');
    return { kind: 'text', text: first.kind === 'text' ? first.text : '', combined: combined, at: first.at };
}

function funilApplyEvents_(s, events) {
    events.forEach(function (ev) {
        try {
            if (ev.type === 'lead') funilUpdateLead_(s, ev.fields);
            else if (ev.type === 'summary') funilWriteSummary_(s, ev.qualified);
            else if (ev.type === 'qualified') funilNotifyTeam_(s, 'Lead qualificado no WhatsApp (rota ' + s.route + ')');
            else if (ev.type === 'handoff') funilNotifyTeam_(s, 'Funil WhatsApp pausado: ' + ev.reason);
        } catch (error) {
            Logger.log('funil: evento ' + ev.type + ' falhou para ' + s.key + ': ' + error);
        }
    });
}

// ============================================
// Envio pela Evolution API
// ============================================

function funilSendActions_(s, actions) {
    if (!actions.length) return;
    const config = FUNIL_DRY_RUN ? null : getEvolutionConfig_();
    const lastAsk = actions.length - 1;
    actions.forEach(function (action, i) {
        if (i === lastAsk) s.askedAt = new Date();
        if (action.type === 'pause') { if (!FUNIL_DRY_RUN) Utilities.sleep(action.ms); return; }
        let ok = false;
        if (action.type === 'audio') {
            ok = funilSendAudio_(config, s.to || s.key, action.id);
            if (!ok) ok = funilSendText_(config, s.to || s.key, action.text, FUNIL.RECORDING_MS);
        } else if (action.type === 'ebook') {
            ok = FUNIL_DRY_RUN ? funilLogSend_('IMAGEM e-book', action.caption)
                : sendEvolutionMedia_(config, s.to || s.key, { mediatype: 'image', mimetype: 'image/jpeg', media: FOLLOWUP_EBOOK_IMAGE_BASE64, fileName: 'ebook-sipop.jpg' }, action.caption) === 'sent';
        } else {
            ok = funilSendText_(config, s.to || s.key, action.text, action.delay || FUNIL.TYPING_MS);
        }
        if (ok) s.lastOut = new Date();
    });
}

let FUNIL_DRY_RUN = false;
let FUNIL_DRY_LOG = [];

function funilLogSend_(kind, text) {
    FUNIL_DRY_LOG.push('BOT [' + kind + '] ' + text);
    return true;
}

function funilEvolutionPost_(config, path, payload) {
    let response;
    try {
        response = UrlFetchApp.fetch(config.url + path + encodeURIComponent(config.instance), {
            method: 'post', contentType: 'application/json',
            headers: { apikey: config.apiKey },
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
        });
    } catch (error) {
        Logger.log('funil: falha ao chamar a Evolution (' + path + '): ' + error);
        return false;
    }
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code < 200 || code >= 300) {
        Logger.log('funil: Evolution recusou (' + path + '): ' + code + ' ' + body.slice(0, 300));
        return false;
    }
    // Guarda o ID para o webhook reconhecer a mensagem como do bot (e não da equipe)
    try {
        const id = JSON.parse(body).key.id;
        if (id) CacheService.getScriptCache().put('funil-out-' + id, '1', 21600);
    } catch (ignore) { /* resposta sem key.id */ }
    return true;
}

function funilSendText_(config, to, text, delay) {
    if (FUNIL_DRY_RUN) return funilLogSend_('texto', text);
    return funilEvolutionPost_(config, '/message/sendText/', { number: to, text: text, delay: delay, linkPreview: false });
}

// Nota de voz (PTT). Falha (ex.: arquivo ainda não publicado) devolve false e o texto vai no lugar.
function funilSendAudio_(config, to, id) {
    if (FUNIL_DRY_RUN) return funilLogSend_('áudio ' + id, FUNIL_AUDIOS[id]);
    const url = FUNIL.AUDIO_BASE_URL + id + FUNIL.AUDIO_EXT;
    if (!funilAudioExists_(url)) return false;
    return funilEvolutionPost_(config, '/message/sendWhatsAppAudio/', { number: to, audio: url, delay: FUNIL.RECORDING_MS, encoding: true });
}

// Confere (com cache de 10 min) se o arquivo de áudio já está publicado.
function funilAudioExists_(url) {
    const cache = CacheService.getScriptCache();
    const key = 'funil-audio-' + Utilities.base64EncodeWebSafe(url).slice(-60);
    const cached = cache.get(key);
    if (cached) return cached === '1';
    let ok = false;
    try {
        const r = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: true, headers: { Range: 'bytes=0-15' } });
        const type = String(r.getHeaders()['Content-Type'] || r.getHeaders()['content-type'] || '');
        ok = (r.getResponseCode() === 200 || r.getResponseCode() === 206) && /audio|octet-stream|mpeg|ogg/i.test(type);
    } catch (error) { ok = false; }
    cache.put(key, ok ? '1' : '0', 600);
    return ok;
}

// ============================================
// Estado da conversa (aba "Funil WhatsApp")
// ============================================

const FUNIL_COLUMNS = [
    ['Contato', 'key'], ['Telefone', 'phone'], ['Enviar para', 'to'], ['Nome', 'name'], ['Nome no WhatsApp', 'pushName'],
    ['Origem', 'origin'], ['Etapa', 'step'], ['Nota', 'score'], ['Rota', 'route'], ['E-mail', 'email'],
    ['Pausado', 'paused'], ['Início', 'startedAt'], ['Última msg do lead', 'lastIn'], ['Última msg do bot', 'lastOut'],
    ['Follow-ups', 'fu'], ['Inválidas', 'invalid'], ['Token', 'token'], ['Link', 'link'],
    ['Respostas', 'answers'], ['Ocupado até', 'busyUntil'], ['Fila', 'queue'], ['Pergunta enviada em', 'askedAt'],
];
const FUNIL_JSON_FIELDS = ['answers', 'queue'];

let FUNIL_MEMORY = null; // usado só por previewFunilConversa()

function funilSheet_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(FUNIL.SHEET);
    if (!sheet) {
        sheet = ss.insertSheet(FUNIL.SHEET);
        sheet.getRange(1, 1, 1, FUNIL_COLUMNS.length).setValues([FUNIL_COLUMNS.map(function (c) { return c[0]; })])
            .setFontWeight('bold').setBackground('#2C7A7B').setFontColor('#FFFFFF');
        sheet.setFrozenRows(1);
        sheet.getRange('A:C').setNumberFormat('@');
    }
    return sheet;
}

function funilNewState_(contact, inbound) {
    return {
        key: contact.key, phone: contact.phone, to: contact.to, name: '', pushName: contact.pushName,
        origin: inbound.kind === 'text' ? funilOriginOf_(inbound.text) : 'orgânico',
        step: 'inicio', score: '', route: '', email: '', paused: '',
        startedAt: new Date(), lastIn: new Date(), lastOut: '', fu: 0, invalid: 0,
        token: '', link: '', answers: { primeira_mensagem: inbound.text || '' }, busyUntil: '', queue: [], askedAt: '',
        row: 0,
    };
}

function funilRowToState_(values, row) {
    const s = { row: row };
    FUNIL_COLUMNS.forEach(function (c, i) {
        let v = values[i];
        if (FUNIL_JSON_FIELDS.indexOf(c[1]) !== -1) {
            try { v = v ? JSON.parse(v) : (c[1] === 'queue' ? [] : {}); } catch (e) { v = c[1] === 'queue' ? [] : {}; }
        }
        s[c[1]] = v;
    });
    s.key = String(s.key);
    s.phone = String(s.phone || '');
    s.to = String(s.to || s.key);
    return s;
}

function funilLoad_(key) {
    if (FUNIL_MEMORY) return FUNIL_MEMORY[key] ? JSON.parse(JSON.stringify(FUNIL_MEMORY[key]), funilReviveDates_) : null;
    const sheet = funilSheet_();
    const cell = sheet.getRange('A:A').createTextFinder(String(key)).matchEntireCell(true).findNext();
    if (!cell || cell.getRow() === 1) return null;
    const row = cell.getRow();
    return funilRowToState_(sheet.getRange(row, 1, 1, FUNIL_COLUMNS.length).getValues()[0], row);
}

function funilReviveDates_(k, v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) &&
        ['startedAt', 'lastIn', 'lastOut', 'busyUntil', 'askedAt'].indexOf(k) !== -1 ? new Date(v) : v;
}

function funilSave_(s) {
    if (FUNIL_MEMORY) { FUNIL_MEMORY[s.key] = JSON.parse(JSON.stringify(s)); return; }
    const sheet = funilSheet_();
    const values = FUNIL_COLUMNS.map(function (c) {
        const v = s[c[1]];
        if (FUNIL_JSON_FIELDS.indexOf(c[1]) !== -1) return JSON.stringify(v || (c[1] === 'queue' ? [] : {}));
        return v === undefined || v === null ? '' : v;
    });
    if (!s.row) {
        s.row = sheet.getLastRow() + 1;
        sheet.getRange(s.row, 1, 1, 3).setNumberFormat('@');
    }
    sheet.getRange(s.row, 1, 1, values.length).setValues([values]);
}

// Durante o processamento, o webhook só mexe em fila, última mensagem do lead e pausa.
function funilMergeFromSheet_(s) {
    const fresh = funilLoad_(s.key);
    if (!fresh) return;
    s.queue  = fresh.queue || [];
    s.lastIn = fresh.lastIn;
    if (fresh.paused && !s.paused) s.paused = fresh.paused;
    if (!s.row) s.row = fresh.row;
}

function funilWithLock_(fn) {
    if (FUNIL_MEMORY) return fn();
    const lock = LockService.getDocumentLock() || LockService.getScriptLock();
    lock.waitLock(28000);
    try { return fn(); } finally { SpreadsheetApp.flush(); lock.releaseLock(); }
}

// ============================================
// Lead na aba de contatos
// ============================================

function funilContactsSheet_() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Aba "' + SHEET_NAME + '" não encontrada.');
    return sheet;
}

function funilCreateLead_(s) {
    if (FUNIL_MEMORY) { s.token = 'teste'; s.link = agendaBookUrl_('', 'pt'); return; }
    try {
        const sheet = funilContactsSheet_();
        const now = new Date();
        const values = {
            date: now, time: now,
            source: FUNIL.SOURCE + ' ' + s.origin,
            name: funilFirstName_(s.pushName) ? s.pushName : '',
            email: '',
            phone: s.phone ? asTextFormula(formatPhoneBR('+' + s.phone)) : '',
            language: 'Portuguese',
        };
        const cols = resolveLeadColumns_(sheet, values);
        const width = Math.max(sheet.getLastColumn(), Math.max.apply(null, Object.keys(cols).map(function (k) { return cols[k]; })));
        const row = new Array(width).fill('');
        Object.keys(cols).forEach(function (k) { row[cols[k] - 1] = values[k]; });
        sheet.appendRow(row);
        const lastRow = sheet.getLastRow();
        sheet.getRange(lastRow, cols.date).setNumberFormat('yyyy-mm-dd');
        sheet.getRange(lastRow, cols.time).setNumberFormat('hh:mm:ss');
        sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).setBackground('#E6FFFA'); // verde-água: veio do WhatsApp

        const headerRow = findLeadHeaderRow_(sheet).row;
        // Primeiro contato e follow-up do formulário não mexem em quem está no funil
        const sentCol = ensureColumn_(sheet, headerRow, WHATSAPP.SENT_HEADER, 1);
        sheet.getRange(lastRow, sentCol).setValue(FUNIL.FIRST_CONTACT_MARK);

        s.token = agendaAssignLeadToken_(sheet, lastRow, headerRow);
        s.link  = agendaBookUrl_(s.token, 'pt');
    } catch (error) {
        Logger.log('funil: não consegui criar o lead na aba de contatos: ' + error);
        s.link = s.link || agendaBookUrl_('', 'pt');
    }
    funilWithLock_(function () { funilMergeFromSheet_(s); funilSave_(s); });
}

function funilFindLeadRow_(sheet, headerRow, token) {
    if (!token) return 0;
    const col = ensureColumn_(sheet, headerRow, AGENDA.TOKEN_HEADER, 1);
    const cell = sheet.getRange(1, col, sheet.getLastRow(), 1).createTextFinder(token).matchEntireCell(true).findNext();
    return cell ? cell.getRow() : 0;
}

// fields: chaves de LEAD_FIELDS (name, email, specialty, careerStage, objectiveType, objective)
function funilUpdateLead_(s, fields) {
    if (FUNIL_MEMORY) { FUNIL_DRY_LOG.push('PLANILHA ' + JSON.stringify(fields)); return; }
    const sheet = funilContactsSheet_();
    const headerRow = findLeadHeaderRow_(sheet).row;
    const row = funilFindLeadRow_(sheet, headerRow, s.token);
    if (!row) { Logger.log('funil: lead de ' + s.key + ' não encontrado na aba de contatos.'); return; }
    const cols = resolveLeadColumns_(sheet, fields);
    Object.keys(fields).forEach(function (k) {
        if (cols[k]) sheet.getRange(row, cols[k]).setValue(fields[k]);
    });
}

function funilWriteSummary_(s, qualified) {
    const a = s.answers || {};
    const fields = {
        specialty:     a.area ? funilOptionLabel_('area', a.area) : '',
        careerStage:   a.estagio ? funilOptionLabel_('estagio', a.estagio) : '',
        objectiveType: a.objetivo ? funilOptionLabel_('objetivo', a.objetivo) : '',
        objective:     funilSummary_(s, qualified),
    };
    Object.keys(fields).forEach(function (k) { if (!fields[k]) delete fields[k]; });
    funilUpdateLead_(s, fields);
    if (FUNIL_MEMORY) return;

    // Rota B que virou "sim" depois do resumo já separado: corrige as colunas da nota
    try {
        const sheet = funilContactsSheet_();
        const headerRow = findLeadHeaderRow_(sheet).row;
        const row = funilFindLeadRow_(sheet, headerRow, s.token);
        const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(funilNorm_);
        const qCol = headers.indexOf('qualificado') + 1;
        const nCol = headers.indexOf('nota do lead') + 1;
        if (row && qCol && sheet.getRange(row, qCol).getValue() !== '') sheet.getRange(row, qCol).setValue(qualified ? 'sim' : 'não');
        if (row && nCol && sheet.getRange(row, nCol).getValue() !== '') sheet.getRange(row, nCol).setValue(Number(s.score) || 0);
        splitDetails();
    } catch (error) {
        Logger.log('funil: não consegui separar o resumo: ' + error);
    }
}

function funilNotifyTeam_(s, subject) {
    if (FUNIL_MEMORY) { FUNIL_DRY_LOG.push('E-MAIL EQUIPE: ' + subject); return; }
    const a = s.answers || {};
    const label = function (key) { return a[key] ? funilOptionLabel_(key, a[key]) : '—'; };
    const chat = s.phone ? 'https://wa.me/' + s.phone : s.key;
    const body = [
        subject, '',
        'Nome:      ' + (s.name || s.pushName || '—'),
        'WhatsApp:  ' + chat,
        'E-mail:    ' + (s.email || '—'),
        'Origem:    ' + (s.origin || '—'),
        'Etapa:     ' + s.step + (s.paused ? ' (pausado: ' + s.paused + ')' : ''),
        'Nota:      ' + (s.score === '' ? '—' : s.score) + (s.route ? ' · rota ' + s.route : ''),
        '',
        'Fase:      ' + label('fase'),
        'Estudo:    ' + label('tipo_estudo'),
        'Estágio:   ' + label('estagio'),
        'Área:      ' + label('area'),
        'Objetivo:  ' + label('objetivo'),
        'Prazo:     ' + label('prazo'),
        'Detalhes:  ' + (a.detalhes || '—'),
        '',
        'Para devolver a conversa ao bot, apague a célula "Pausado" na aba "' + FUNIL.SHEET + '".',
    ].join('\n');
    EMAIL_RECIPIENTS.forEach(function (to) {
        MailApp.sendEmail({ to: to, subject: '[SIPOP] ' + subject + ': ' + (s.name || s.pushName || s.key), body: body });
    });
}

// ============================================
// Gatilho: follow-ups, "detalhes" sem resposta e agendamentos
// ============================================

function setupFunilTrigger() {
    removeFunilTrigger();
    ScriptApp.newTrigger('runFunilTimers').timeBased().everyMinutes(FUNIL.TRIGGER_MINUTES).create();
    Logger.log('Gatilho criado: runFunilTimers a cada ' + FUNIL.TRIGGER_MINUTES + ' min.');
}

function removeFunilTrigger() {
    ScriptApp.getProjectTriggers()
        .filter(function (t) { return t.getHandlerFunction() === 'runFunilTimers'; })
        .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function funilInFollowUpWindow_(now) {
    const shifted = new Date(now.getTime() + FUNIL.UTC_OFFSET_HOURS * 3600000);
    const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    return minutes >= FUNIL.FOLLOWUP_START_MIN && minutes < FUNIL.FOLLOWUP_END_MIN;
}

function runFunilTimers() {
    const sheet = funilSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return;
    const now = new Date();
    const states = sheet.getRange(2, 1, last - 1, FUNIL_COLUMNS.length).getValues()
        .map(function (values, i) { return funilRowToState_(values, i + 2); });

    // Quem recebeu o link e já marcou a call (aba Agenda)
    const booked = {};
    try {
        agendaReadBookings_(agendaBookingsSheet_()).forEach(function (b) {
            if (b.status === AGENDA.BOOKED || b.status === AGENDA.CONFIRMED) booked[b.token] = true;
        });
    } catch (error) { Logger.log('funil: não consegui ler a Agenda: ' + error); }

    states.forEach(function (snapshot) {
        if (snapshot.paused || !snapshot.key) return;
        if (funilIsDate_(snapshot.busyUntil) && snapshot.busyUntil > now) return;

        if (snapshot.step === 'link' && snapshot.token && booked[snapshot.token]) {
            funilWithLock_(function () {
                const s = funilLoad_(snapshot.key);
                if (s && s.step === 'link') { s.step = 'agendado'; funilSave_(s); }
            });
            return;
        }

        // "detalhes" sem resposta: segue sozinho
        if (snapshot.step === 'detalhes' && funilIsDate_(snapshot.lastOut) &&
            !(funilIsDate_(snapshot.lastIn) && snapshot.lastIn > snapshot.lastOut) &&
            now - snapshot.lastOut >= FUNIL.DETAILS_TIMEOUT_MIN * 60000) {
            funilProcess_({ key: snapshot.key, phone: snapshot.phone, to: snapshot.to, pushName: snapshot.pushName },
                { kind: 'timeout', text: '', at: now.toISOString() });
            return;
        }

        if (!funilInFollowUpWindow_(now)) return;
        let actions = null;
        let s = null;
        const go = funilWithLock_(function () {
            s = funilLoad_(snapshot.key);
            if (!s || s.paused || (funilIsDate_(s.busyUntil) && s.busyUntil > new Date())) return false;
            actions = funilFollowUpActions_(s, now);
            if (!actions) return false;
            s.busyUntil = new Date(Date.now() + FUNIL.BUSY_MS);
            funilSave_(s);
            return true;
        });
        if (!go) return;
        let pending = null;
        try {
            funilSendActions_(s, actions);
        } finally {
            funilWithLock_(function () {
                funilMergeFromSheet_(s);
                s.busyUntil = '';
                pending = s.queue.length ? s.queue[s.queue.length - 1] : null;
                s.queue = [];
                funilSave_(s);
            });
        }
        // Resposta que chegou enquanto o lembrete saía: trata agora
        if (pending) funilProcess_({ key: s.key, phone: s.phone, to: s.to, pushName: s.pushName }, pending);
    });
}

// ============================================
// Configuração do webhook na Evolution API
// ============================================

function setupFunilWebhook() {
    const props = PropertiesService.getScriptProperties();
    let secret = props.getProperty('FUNIL_WEBHOOK_SECRET');
    if (!secret) {
        secret = Utilities.getUuid().replace(/-/g, '').slice(0, 24);
        props.setProperty('FUNIL_WEBHOOK_SECRET', secret);
        Logger.log('FUNIL_WEBHOOK_SECRET criado.');
    }
    // Mesma implantação que o site usa (Netlify Function). ScriptApp.getService().getUrl()
    // pode devolver outra implantação quando o projeto tem mais de uma.
    const execUrl = props.getProperty('FUNIL_WEBHOOK_URL') || REMARKETING.WEB_APP_URL;
    const config = getEvolutionConfig_();
    const headers = { apikey: config.apiKey };

    const current = UrlFetchApp.fetch(config.url + '/webhook/find/' + encodeURIComponent(config.instance), { headers: headers, muteHttpExceptions: true });
    let existing = {};
    try { existing = JSON.parse(current.getContentText()) || {}; } catch (e) { existing = {}; }
    // Um webhook anterior do próprio funil (?funil=) pode ser substituído
    if (existing.enabled && existing.url && existing.url.indexOf(execUrl) !== 0 && existing.url.indexOf('?funil=') < 0) {
        Logger.log('A instância já tem outro webhook ativo: ' + existing.url + '\nNada foi alterado. ' +
            'Se ele puder ser trocado, desative-o na Evolution e rode de novo.');
        return;
    }

    const target = execUrl + '?funil=' + encodeURIComponent(secret);
    const response = UrlFetchApp.fetch(config.url + '/webhook/set/' + encodeURIComponent(config.instance), {
        method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
        payload: JSON.stringify({ webhook: { enabled: true, url: target, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] } }),
    });
    Logger.log('Webhook: ' + response.getResponseCode() + ' ' + response.getContentText().slice(0, 300));
}

// ============================================
// Testes
// ============================================

// Simula uma conversa inteira no log (nada é enviado nem gravado).
// Troque as respostas para testar outras rotas.
function previewFunilConversa() {
    const respostas = ['Oi, quero avaliar meu projeto (prazo)', 'Dra. Ana Paula', '3', 'revisão sistemática', '2', 'fisio',
        '4', 'até 3 meses', 'Meta-análise sobre GLP-1 e massa magra', 'ana@exemplo.com', 'obrigada!'];
    Logger.log(funilSimulate_(respostas).join('\n'));
}

function funilSimulate_(messages) {
    FUNIL_MEMORY = {};
    FUNIL_DRY_RUN = true;
    FUNIL_DRY_LOG = [];
    const contact = { key: '5500000000000', phone: '5500000000000', to: '5500000000000', pushName: 'Ana P.' };
    try {
        messages.forEach(function (text) {
            FUNIL_DRY_LOG.push('LEAD: ' + text);
            funilProcessForTest_(contact, { kind: 'text', text: text, at: new Date().toISOString() });
        });
        const s = FUNIL_MEMORY[contact.key];
        FUNIL_DRY_LOG.push('--- etapa: ' + (s && s.step) + ' · nota: ' + (s && s.score) + ' · rota: ' + (s && s.route) + (s && s.paused ? ' · pausado: ' + s.paused : ''));
        return FUNIL_DRY_LOG.slice();
    } finally {
        FUNIL_MEMORY = null;
        FUNIL_DRY_RUN = false;
    }
}

// Mesmo fluxo de funilProcess_, sem a espera de "detalhes" e sem o teste de entrada.
function funilProcessForTest_(contact, inbound) {
    let s = funilLoad_(contact.key);
    if (!s) { s = funilNewState_(contact, inbound); funilCreateLead_(s); }
    s.lastIn = new Date();
    if (s.paused) return;
    if (s.step === 'detalhes') inbound = { kind: 'text', text: inbound.text, combined: inbound.text, at: inbound.at };
    const result = funilTransition_(s, inbound);
    result.events.forEach(function (ev) {
        if (ev.type === 'lead') funilUpdateLead_(s, ev.fields);
        else if (ev.type === 'summary') FUNIL_DRY_LOG.push('PLANILHA resumo:\n' + funilSummary_(s, ev.qualified));
        else FUNIL_DRY_LOG.push('EVENTO ' + JSON.stringify(ev));
    });
    funilSendActions_(s, result.actions);
    funilSave_(s);
}

// Apaga a conversa de FUNIL_RESET_NUMERO (com DDI) da aba do funil, para testar de novo.
function resetFunilContato() {
    const number = String(PropertiesService.getScriptProperties().getProperty('FUNIL_RESET_NUMERO') || '').replace(/\D/g, '');
    if (!number) throw new Error('Defina FUNIL_RESET_NUMERO nas Propriedades do script (com DDI).');
    const s = funilPhoneVariants_(number).map(funilLoad_).filter(Boolean)[0];
    if (!s) { Logger.log('Nenhuma conversa com ' + number + '.'); return; }
    funilSheet_().deleteRow(s.row);
    Logger.log('Conversa de ' + number + ' apagada da aba "' + FUNIL.SHEET + '". O lead na aba de contatos continua lá.');
}
