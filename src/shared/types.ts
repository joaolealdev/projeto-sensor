// Mensagens trocadas entre Gateway e Servidor de Sensor

export interface ReadSensorsRequest {
  type: "READ_SENSORS";
  gateway?: string;
}

export interface SensorReadingResponse {
  type: "SENSOR_READING";
  sensorNode: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  solarRadiation: number;
}

export interface ErrorResponse {
  type: "ERROR";
  message: string;
}

export type SensorServerRequest = ReadSensorsRequest;
export type SensorServerResponse = SensorReadingResponse | ErrorResponse;

// Mensagens trocadas entre Gateway e Average Service

export interface GatewayReading {
  type: "GATEWAY_READING";
  gateway: string;
  sensorNode: string;
  timestamp: string;
  temperature: number;
  humidity: number;
  solarRadiation: number;
}

export interface AckResponse {
  type: "ACK";
}

export type AverageServiceRequest = GatewayReading;
export type AverageServiceResponse = AckResponse | ErrorResponse;

// Registro consolidado persistido em data/averages.json

export interface AveragesRecord {
  gateway: string;
  periodStart: string;
  periodEnd: string;
  samples: number;
  averages: {
    temperature: number;
    humidity: number;
    solarRadiation: number;
  };
}
