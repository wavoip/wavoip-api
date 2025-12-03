type ErrorSource = "microphone" | "audio";

export class MultimediaError {
    constructor(
        readonly source: ErrorSource,
        readonly exception: DOMException,
    ) {}

    toString() {
        if (this.source === "audio") {
            if (this.exception.name === "NotAllowedError") {
                return "Permissão do alto falante foi negada";
            }
        }

        if (this.exception.name === "NotAllowedError") {
            return "Permissão do microfone foi negada";
        }
        if (this.exception.name === "OverconstrainedError") {
            return "Microfone não suporta os requisitos de áudio";
        }
        if (this.exception.name === "SecurityError") {
            return "Não é possível acessar o microfone, a página é insegura";
        }
        if (this.exception.name === "NotReadableError") {
            return "Não foi possível acessar o microfone";
        }
        if (this.exception.name === "NotFoundError") {
            return "Nenhum microfone encontrado";
        }
        if (this.exception.name === "AbortError") {
            return "O hardware do microfone não pode ser inicializado";
        }

        return "Algo falhou";
    }
}
