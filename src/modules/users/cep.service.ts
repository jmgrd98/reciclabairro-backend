import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/app.exception.js';

export interface CepResult {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface ViaCepResponse {
  erro?: boolean | string;
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

/** Consulta de CEP no serviço público ViaCEP, para preencher o formulário de endereço. */
@Injectable()
export class CepService {
  async lookup(cep: string): Promise<CepResult> {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      throw AppException.badRequest(
        'INVALID_CEP',
        'Informe um CEP com 8 dígitos.',
      );
    }

    let data: ViaCepResponse;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = (await response.json()) as ViaCepResponse;
    } catch {
      throw new AppException(
        503,
        'CEP_SERVICE_UNAVAILABLE',
        'Não conseguimos consultar o CEP agora. Preencha o endereço manualmente.',
      );
    }

    if (data.erro) {
      throw AppException.notFound('CEP_NOT_FOUND', 'CEP não encontrado.');
    }
    return {
      zipCode: data.cep ?? digits,
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
    };
  }
}
