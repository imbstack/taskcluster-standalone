{{- define "taskcluster.secrets" }}
apiVersion: v1
kind: Secret
metadata:
  name: {{ template "fullname" . }}
  labels:
    app: {{ template "fullname" . }}
    chart: "{{ .Chart.Name }}-{{ .Chart.Version }}"
    release: "{{ .Release.Name }}"
    heritage: "{{ .Release.Service }}"
type: Opaque
data:
  {{- range $key, $val := .Values.secrets }}
  {{ $key }}: {{ default "MISSING" $val | b64enc | quote }}
  {{- end }}
{{- end }}
