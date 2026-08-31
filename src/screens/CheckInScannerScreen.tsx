import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { OrganizerStackParamList } from '../navigation/types';
import { checkInTicket } from '../api/tickets';
import { ApiError } from '../api/client';
import PrimaryButton from '../components/PrimaryButton';

type Props = NativeStackScreenProps<OrganizerStackParamList, 'CheckInScanner'>;

interface LastResult {
  kind: 'success' | 'already' | 'error';
  title: string;
  detail: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function CheckInScannerScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const isProcessing = useRef(false);

  const handleScanned = async (result: BarcodeScanningResult) => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    try {
      const response = await checkInTicket(result.data);
      setLastResult({
        kind: 'success',
        title: 'Ingresso válido ✅',
        detail: `${response.ticket.buyerName} · ${response.ticket.quantity}x ${response.ticket.ticketTypeName}`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const data = err.data as { ticket?: { buyerName: string; checkedInAt: string } };
        setLastResult({
          kind: 'already',
          title: 'Ingresso já validado ⚠️',
          detail: data.ticket
            ? `${data.ticket.buyerName} · validado às ${formatTime(data.ticket.checkedInAt)}`
            : err.message,
        });
      } else {
        setLastResult({
          kind: 'error',
          title: 'Ingresso inválido ❌',
          detail: err instanceof ApiError ? err.message : 'Não foi possível validar.',
        });
      }
    } finally {
      setTimeout(() => {
        isProcessing.current = false;
      }, 1500);
    }
  };

  if (!permission) {
    return <View style={styles.centered} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color="#9CA3AF" />
        <Text style={styles.permissionText}>
          Precisamos da sua permissão para usar a câmera e escanear os ingressos.
        </Text>
        <PrimaryButton title="Permitir câmera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleScanned}
      />

      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Aponte a câmera para o QR code do ingresso</Text>
      </View>

      <Pressable style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={26} color="#fff" />
      </Pressable>

      {lastResult && (
        <View
          style={[
            styles.resultCard,
            lastResult.kind === 'success' && styles.resultSuccess,
            lastResult.kind === 'already' && styles.resultWarning,
            lastResult.kind === 'error' && styles.resultError,
          ]}
        >
          <Text style={styles.resultTitle}>{lastResult.title}</Text>
          <Text style={styles.resultDetail}>{lastResult.detail}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 32,
    gap: 16,
  },
  permissionText: { textAlign: 'center', color: '#374151', fontSize: 15 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    marginTop: 20,
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCard: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    borderRadius: 16,
    padding: 18,
  },
  resultSuccess: { backgroundColor: '#059669' },
  resultWarning: { backgroundColor: '#D97706' },
  resultError: { backgroundColor: '#DC2626' },
  resultTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  resultDetail: { color: '#fff', fontSize: 13, marginTop: 4, opacity: 0.9 },
});
