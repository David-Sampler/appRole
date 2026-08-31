import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';

interface FaqItem {
  question: string;
  answer: string;
}

const buyerFaq: FaqItem[] = [
  {
    question: 'Como compro um ingresso?',
    answer:
      'Escolha um evento em "Explorar", toque nele, selecione o tipo de ingresso e a quantidade. Você será levado ao checkout do Mercado Pago pra pagar. Depois de confirmado, o ingresso aparece em "Meus Ingressos".',
  },
  {
    question: 'Como funciona o QR code na entrada do evento?',
    answer:
      'Cada ingresso pago tem um QR code único em "Meus Ingressos". Mostre ele pro organizador na entrada — ele valida pela câmera do app dele. Cada código só pode ser usado uma vez.',
  },
  {
    question: 'Posso cancelar um ingresso e ser reembolsado?',
    answer:
      'Sim, enquanto o ingresso estiver pago e ainda não tiver sido validado na entrada. Em "Meus Ingressos", toque em "Cancelar ingresso" no card do ingresso — o reembolso é processado automaticamente pelo Mercado Pago.',
  },
  {
    question: 'Não recebi o email de confirmação da compra, e agora?',
    answer:
      'O ingresso já fica disponível em "Meus Ingressos" assim que o pagamento é aprovado, mesmo que o email demore ou não chegue. Você não precisa do email pra usar o ingresso.',
  },
];

const organizerFaq: FaqItem[] = [
  {
    question: 'Como crio um evento?',
    answer:
      'Em "Meus Eventos", toque no botão "+" (ou "Criar meu primeiro evento"). Preencha os dados, escolha uma imagem de capa e defina os tipos de ingresso com preço e quantidade.',
  },
  {
    question: 'Como recebo o dinheiro das vendas?',
    answer:
      'Conecte sua conta do Mercado Pago em Perfil → "Conectar Mercado Pago". Cada venda cai direto na sua conta, já descontando a taxa da plataforma — você não precisa esperar ninguém repassar.',
  },
  {
    question: 'Posso editar ou cancelar um evento depois de publicado?',
    answer:
      'Sim. Na tela de detalhes do evento, use "Editar evento" pra mudar informações e ingressos (a quantidade não pode ficar menor que o já vendido), ou "Cancelar evento" pra tirá-lo da vitrine pública.',
  },
  {
    question: 'Por que preciso confirmar meu email?',
    answer:
      'Pra publicar eventos, novos organizadores precisam confirmar o email com um código de 6 dígitos enviado na hora do cadastro — é uma verificação rápida pra evitar contas falsas.',
  },
  {
    question: 'Um comprador cancelou o ingresso, o que acontece?',
    answer:
      'O valor é reembolsado automaticamente pelo Mercado Pago pro comprador, e a vaga volta a ficar disponível pra venda.',
  },
  {
    question: 'Como valido os ingressos na entrada do evento?',
    answer:
      'Na tela de detalhes do evento, toque em "Validar ingressos na entrada" pra abrir o leitor de QR code. Cada ingresso só pode ser validado uma vez.',
  },
];

function FaqCard({ item }: { item: FaqItem }) {
  const colors = useThemeStore((s) => s.colors);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Pressable style={styles.card} onPress={() => setIsOpen((v) => !v)}>
      <View style={styles.cardHeader}>
        <Text style={styles.question}>{item.question}</Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
      </View>
      {isOpen && <Text style={styles.answer}>{item.answer}</Text>}
    </Pressable>
  );
}

export default function HelpScreen() {
  const role = useAuthStore((s) => s.user?.role);
  const faq = role === 'organizer' ? organizerFaq : buyerFaq;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={styles.title}>Como funciona</Text>
      <Text style={styles.subtitle}>
        {role === 'organizer'
          ? 'Perguntas frequentes de quem organiza eventos na Rolê.'
          : 'Perguntas frequentes de quem compra ingressos na Rolê.'}
      </Text>
      {faq.map((item) => (
        <FaqCard key={item.question} item={item} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 20, lineHeight: 18 },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  question: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  answer: { fontSize: 13, color: '#4B5563', lineHeight: 19, marginTop: 10 },
});
