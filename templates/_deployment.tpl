{{- define "taskcluster.deployment" }}
{{- $topscope := . -}}
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: {{ template "fullname" . }}
  labels:
    chart: "{{ .Chart.Name }}-{{ .Chart.Version }}"
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    metadata:
      labels:
        app: {{ template "fullname" . }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}"
        env:
        - name: NODE_ENV
          value: {{ .Values.global.node_env }}
        - name: DEBUG
          value: {{ .Values.global.debug | quote }}
        - name: PROC_NAME
          value: {{ .Values.image.proc }}
        {{- range $key, $_ := .Values.secrets }}
        - name: {{ $key }}
          valueFrom:
            secretKeyRef:
              name: {{ template "fullname" $topscope }}
              key: {{ $key }}
        {{- end }}
        ports:
        - containerPort: {{ .Values.service.internalPort }}
{{- end }}
