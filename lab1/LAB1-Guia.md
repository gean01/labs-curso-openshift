# PUCPR – Escola Politécnica
Curso: Infraestrutura Cloud na Prática: Virtualização, SDN e Kubernetes  
Módulo 5.2: OpenShift  
Prof. Gean Ribeiro dos Santos


**LAB 1: Explorando a Infraestrutura de um Cluster OpenShift — Provisionamento e Resiliência de Serviços com o Banco de Dados PostgreSQL (Sandbox)**



Neste laboratório provisionaremos um sistema gerenciador de banco de dados PostgreSQL com separação entre primário e réplica. Usaremos parte do conhecimento que aprendemos até agora no nosso curso de OpenShift: StatefulSet, Service (ClusterIP e Headless), Secret, ConfigMap e PVC. Validaremos resiliência (self-healing + persistência).

**Ambiente:** OpenShift Sandbox.

Questões marcadas em <mark>AMARELO</mark> devem constar no seu relatório a ser entregue no prazo indicado pelo professor.

## Pré-requisitos

1. Conta no OpenShift Sandbox e programa `oc` instalado no seu sistema operacional (Windows, Linux ou Mac).

2. Cópia do repositório do lab:

```bash
git clone https://github.com/gean01/labs-curso-openshift.git
cd labs-curso-openshift
```

Importante: caso não tenha o programa git para clonar o repositório (comando anterior falha), baixe e descompacte o zip em https://github.com/gean01/labs-curso-openshift/archive/refs/heads/main.zip

3. Login no cluster

- Acesse https://sandbox.redhat.com/
- Na seção "OpenShift", clique em "Try it"
- Na tela que se abre, clique no canto superior direito em `<SEU_LOGIN>-dev` (exemplo: `gean-dev`)
- Clique em "Copy login command"
- Na tela que se abre, clique em "Display Token"
- Copie a linha abaixo de "Log in with this token". Ela se parece com este exemplo:

```bash
oc login --token=sha256~<SEU_TOKEN> --server=<ENDERECO_DO_SEU_CLUSTER>
```

- Cole o comando copiado no seu terminal

4. Confirme se o login deu certo e qual o projeto que está selecionado:

Ver o projeto:

```bash
oc project
```

Saída esperada: `Using project "<LOGIN>-dev" on server "https://api.<dominio>.openshiftapps.com:6443".`


## Parte 1 — Exploração do ambiente

Comece reconhecendo o Project atual e os objetos já existentes. No OpenShift, Project é um CRD que envolve o Namespace do Kubernetes e acrescenta governança multi-tenancy.

Ver projects existentes:

```bash
oc get projects
```





## Parte 2 — Secret e ConfigMap

Secret e ConfigMap desacoplam configuração da imagem. O Secret guarda dados sensíveis (usuário/senha); o ConfigMap guarda parâmetros não secretos. Nos manifestos do tipo Secret usamos o atributo `stringData` para poder escrever os valores das variáveis em texto claro no YAML mas, no OpenShift, o API server gravará em base64 no etcd.

Acesse a pasta `lab1`:

```bash
cd lab1
```

Crie o segredo a partir do manifesto `01-secret.yaml`:

```bash
oc apply -f 01-secret.yaml
```

Repare o nome do secret criado na saída do comando.

Crie o ConfigMap:

```bash
oc apply -f 02-configmap.yaml
```

Compare a saída do comando a seguir com o conteúdo de `01-secret.yaml` (na parte de chaves e valores):

```bash
oc get secret lab-pg-secret -o yaml
oc get configmap lab-pg-configmap -o yaml
```

Extraia de volta os pares chave/valor do secret para texto claro:

```bash
oc extract secret/lab-pg-secret --to=-
```

Observe que `oc extract` mostra os valores decodificados. Em produção, o acesso a Secrets deve ser controlado.

<mark>**Q1:** Qual o valor da chave `POSTGRESQL_MASTER_PASSWORD` codificada em base64 (embaralhada) no secret?</mark>

<mark>**Q2:** O campo `stringData` no manifesto do Secret evita que você precise escrever base64 manualmente. O que o cluster faz com esses valores ao persistir o objeto no etcd?</mark>

## Parte 3 — Services ClusterIP e Headless

Pods possivelmente mudam de IP a cada recriação. O Service oferece um DNS estável. Neste lab há quatro Services: dois do tipo ClusterIP (primary/replica) para clientes, e dois do tipo Headless (com a propriedade `clusterIP: None`) para identidade DNS dos StatefulSets. O campo seletor do Service usa labels (`app` e `role`): é isso que diz ao Service quais são os seus Pods (veremos mais pra frente onde este label foi definido nos pods).

```bash
oc apply -f 03-service.yaml
```

Abra o arquivo `03-service.yaml`. Repare que é um único arquivo YAML com 4 manifestos independentes (quatro objetos Service) e a linha `---` separando eles.

Preste atenção no trecho:

```yaml
labels:
  app: lab-pg
  (…)
```

Que diz: a este serviço, acrescente este label: `app` com valor `lab-pg`.

Repare também as linhas:

```yaml
selector:
  app: lab-pg
  role: replica
```

que dizem: os pods relacionados a este serviço são aqueles marcados com labels `app` e `role` com os valores `lab-pg` e `replica`, respectivamente.

Compare com as seguintes linhas do StatefulSet (`lab1/04-statefulset.yaml`). Repare que é um único arquivo YAML com 2 manifestos independentes (dois StatefulSet) e a linha `---` separando eles.

```yaml
template:
  metadata:
    labels:
      app: lab-pg
      role: primary
(…)
template:
  metadata:
    labels:
      app: lab-pg
      role: replica
```

Liste no seu namespace os serviços que possuem label (`l`) `app` com valor `lab-pg`.

Veja que temos 4 serviços, dois deles com IP e dois sem IP (headless):

```bash
oc get svc -l app=lab-pg -o wide
```

Veja detalhes dos Services:

```bash
oc describe svc lab-pg-svc-primary
oc describe svc lab-pg-svc-headless-replica
```

Ainda não há Pods atrás dos Services (os StatefulSets vêm na próxima parte). Mesmo assim o objeto DNS já existe. A réplica usará o nome DNS conforme definido na variável `POSTGRESQL_MASTER_IP` (com valor `lab-pg-svc-primary`) para achar o master de forma estável (sem precisar do IP do pod, que é efêmero).

Confira que ainda não temos pods:

```bash
oc get pods
```

<mark>**Q3:** Quando executamos `oc get pods`, de onde o cluster obtém essa informação (qual componente armazena o estado desejado/observado)?</mark>

<mark>**Q4:** Por que a réplica tem a variável de ambiente `POSTGRESQL_MASTER_IP` com valor o nome DNS `lab-pg-svc-primary` e não o IP do Pod no qual roda a instância primary do PostgreSQL?</mark>

## Parte 4 — StatefulSets, probes e PVC

StatefulSet garante nome ordinal e estável para os pods e PVC dedicado por pod. Usaremos dois StatefulSets (primary e replica).

Crie os StatefulSets:

```bash
oc apply -f 04-statefulset.yaml
```

Acompanhe a criação dos pods. No comando a seguir, o argumento `-w` significa "watch" (acompanhar):

```bash
oc get pods -l app=lab-pg -w
```

(Interrompa o watch com Ctrl+C quando ambos estiverem `1/1 Running`.)

Veja a seção `volumeClaimTemplates` do arquivo `lab1/04-statefulset.yaml`, que pede volumes de 1Gi. Agora veja os PVCs criados:

```bash
oc get pvc -l app=lab-pg
```

Veja o status dos StatefulSets. Aguarde até que a coluna READY tenha `1/1` nos dois:

```bash
oc get statefulset -l app=lab-pg -w
```

Repare que esta aplicação (PostgreSQL) não é HTTP, mas usa readiness probe, embora um pouco diferente da forma como vimos em aula (mais detalhes à frente). A probe usa o comando `/usr/libexec/check-container`, que vem de brinde por usarmos uma imagem oficial da Red Hat: `registry.redhat.io/rhel9/postgresql-13:latest`.

Veja em `lab1/04-statefulset.yaml` a imagem utilizada:

```yaml
spec:
  containers:
    - name: postgresql
      image: registry.redhat.io/rhel9/postgresql-13:latest
```

Veja detalhes sobre a readiness probe definida:

```bash
oc describe pod lab-pg-ss-primary-0
```

Execute o comando a seguir e repare os nomes previsíveis dos pods:

```bash
oc get pods
```

Veja os nomes previsíveis dos PVCs:

```bash
oc get pvc
```

<mark>**Q5:** Por que PostgreSQL neste lab usa StatefulSet em vez de Deployment?</mark>

## Parte 5 — Dados, DNS e resiliência

Teste a conectividade. O DNS estável de um Pod de StatefulSet segue o padrão `<pod>.<headless-service>` (neste exemplo fica `lab-pg-ss-replica-0.lab-pg-svc-headless-replica`).

```bash
oc exec -it lab-pg-ss-primary-0 -- bash -c "timeout 2 bash -c '</dev/tcp/lab-pg-ss-replica-0.lab-pg-svc-headless-replica/5432'"
```

Se não saiu nenhum erro no comando, ele foi com sucesso. Experimente mudar o comando para usar porta 31 (vai dar erro)

oc exec -it lab-pg-ss-primary-0 -- bash -c "timeout 2 bash -c '</dev/tcp/lab-pg-ss-replica-0.lab-pg-svc-headless-replica/5431'"

Teste inserção no banco primário (remova a "\" no Windows): 

```bash
oc exec -it lab-pg-ss-primary-0 -- psql -U app_user -d app_db -c "CREATE TABLE IF NOT EXISTS teste (id INT, nome VARCHAR(50)); INSERT INTO teste VALUES (2, 'Hello, world');"
```

Obs: `INSERT 0 1` é a confirmação do PostgreSQL de que 1 linha foi inserida.

Verifique se houve replicação dos dados do primário para o secundário:

```bash
oc exec -it lab-pg-ss-replica-0 -- psql -U app_user -d app_db -c "SELECT * FROM teste;"
```

Verifique os papéis dos contêineres PostgreSQL:

```bash
oc exec lab-pg-ss-primary-0 -- psql -tAc "SELECT pg_is_in_recovery();"
```

A saída é `t` (true) ou `f` (false).

```bash
oc exec lab-pg-ss-replica-0 -- psql -tAc "SELECT pg_is_in_recovery();"
```

A saída é `t` (true) ou `f` (false).

Esperado: primary responde `f` (não está em recovery); réplica responde `t` (pois está em standby).

No primary, confira que o status é `streaming` (está enviando cópia do banco para as réplicas):

```bash
oc exec lab-pg-ss-primary-0 -- psql -c "SELECT client_addr, state FROM pg_stat_replication;"
```

Compare os IPs com os da saída do comando:

```bash
oc get pods -o wide
```

Simule falha do Pod primary (apagaremos ele) e verifique se o dado sobrevive (PVC é remontado no novo Pod, que terá o mesmo nome):

```bash
oc delete pod lab-pg-ss-primary-0
```

Aguarde o pod ser recriado:

```bash
oc get pod lab-pg-ss-primary-0 -w
```

Veja se os dados continuam:

```bash
oc exec -it lab-pg-ss-primary-0 -- psql -U app_user -d app_db -c "SELECT * FROM teste;"
```

Nota: apagar o Pod **não** apaga o PVC (apagar este, sim, destruiria os dados).

<mark>**Q6:** Veja a saída do comando `oc exec -it lab-pg-ss-primary-0 -- psql -U app_user -d app_db -c "SELECT * FROM teste;"`. Os dados foram preservados?</mark>

## Parte 6 — Limpeza de tudo que foi criado (OPCIONAL)

Atenção. Execute os comandos a seguir apenas se precisar recomeçar o LAB. VAI APAGAR TUDO QUE CRIAMOS ATÉ AQUI!

Apague Pods, Deployments, ReplicaSets, StatefulSets, Services, Routes:

```bash
oc delete all --all
```

Apague os PVCs (volumes solicitados pelos statefulsets):

```bash
oc delete pvc --all
```

Apague secrets e configmaps:

```bash
oc delete secret,configmap -l app=lab-pg
```
