(function (global) {

  //	Cria um ponto de acesso aos metodos atraves do objeto global
  global.trigo = {};

  const trRepetitions = [];
  const trBindings = [];

  let container = null;
  let model = {};

  let onUpdate = () => {
    console.log('Trigo components were updated...');
  };

  /*
   *
   *	Reconhece o container principal, pega todos os elementos com a diretriz tr-value,
   *	inicializa o proxy para intermediar mudanças de estado e inicializa a observação de eventos
   *	Por fim, chama o método update, que popula os templates e elementos que contém diretrizes
   *	com os valores atuais do estado
   *
   */
  trigo.init = (state, cb = null) => {

    //	Inicializa o container principal
    container = document.querySelector("*[tr-init]");
    trigo.container = container;

    //  Os acessos ao modelo passam por um proxy;
    model = new Proxy(state, modelAccessHandler);


    //	Cria um array com os arrays de templates a serem populados
    container.querySelectorAll("*[tr-foreach]").forEach(tag => {
      let modelField = tag.getAttribute("tr-foreach");

      // se declaração do loop não estiver correta, retorna
      if (!/^(\s+|\s?)([a-zA-Z]+ in [a-zA-Z]+)(\s+|\s?)$/.test(modelField)) {
        return;
      }

      //  pega o nome do array a ser usado para gerar os elementos filhos
      modelField = modelField.split(" in ")[1].trim();

      //  pega o array do escopo global
      const listModel = getStateValue(modelField, 'global');

      //  se a variável declarada não é um array, retorna
      if (!Array.isArray(listModel)) return;

      const repetition = foreachBinding({element: tag, scope: listModel});

      //  limpa o interior do elemento para que as bindings do template não sejam tratadas novamente
      tag.innerHTML = "";

      const updateListModel = (evt) => {
        evt.stopPropagation();

        let listItemIndex = getItemIndex(evt.target);
        let field = repetition.model[listItemIndex];
        let terms = evt.target.getAttribute('tr-value');
        terms = terms.split(".");

        for (let i = 1; i < terms.length - 1; i++) {
          field = field[terms[i]];
        }

        if (evt.type === 'change' && evt.target.type === 'checkbox') {
          field[terms[terms.length - 1]] = !field[terms[terms.length - 1]];
          return;
        }

        field[terms[terms.length - 1]] = evt.target.value;

        update();
      };

      //  configura o pai para ouvir mudanças nos campos
      tag.addEventListener('keyup', updateListModel);
      tag.addEventListener('change', updateListModel);

      trRepetitions.push(repetition);
    });


    //	Captura todas as ligacoes
    fetchBindingRequests(container);


    //	Ouve eventos de teclado e mudança para manter view e modelo sincronizados
    container.addEventListener('keyup', evt => updateField(evt, model));
    container.addEventListener('change', evt => updateField(evt, model));


    //  renderiza os laços de repetição e popula as ligações
    trRepetitions.forEach(rep => {
      rep.render();
    });
    update();
    cb();

    return model;
  };


  //  Sets a function to be called when trigo finishes to update
  trigo.onUpdate = (cb) => {
    onUpdate = cb;
  };


  //  Handler do proxy que intercepta os acessos ao modelo
  const modelAccessHandler = {
    set(target, key, value) {
      target[key] = value;

      //  Se o comprimento de um array mudar, renderizar a listagem de novo
      if (Array.isArray(target) && key === 'length') {
        trRepetitions.forEach(rep => {
          rep.render();
        });
      }

      //  Sempre que algum campo do modelo for alterado, a view é atualizada
      update();

      return true;
    },
    get(target, key) {
      if (typeof  target[key] === 'object' && target[key] !== null) {
        return new Proxy(target[key], modelAccessHandler);
      } else {
        return target[key];
      }
    }
  };

  //  Itera por todos os filhos do container passado como argumento e gera uma ligação para
  //  cada {{}} ou tr-value declarada no template.
  const fetchBindingRequests = (container, scope = 'global') => {
    for (let el of container.querySelectorAll('*')) {
      if (!/(<.+>?<\/.+>|<.+\/>)/g.test(el.innerHTML) && /{{([\S\s]+)}}/g.test(el.innerHTML)) {
        trBindings.push(oneWayBinding({element: el, scope: scope}));
      }

      if (el.hasAttribute('tr-value')) {
        trBindings.push(twoWayBinding({element: el, scope: scope}));
      }
    }
  };

  const toggleCheckBox = (target, value) => {

  };


  //  Pega o index do array sendo acessado
  const getItemIndex = (child) => {
    let listItemIndex = undefined;
    let el = child;

    while (!listItemIndex) {
      if (el.hasAttribute('data-index')) {
        listItemIndex = el.getAttribute("data-index");
        return listItemIndex;
      }
      el = el.parentElement;
    }
  };


  //  Cria uma ligação de uma mão
  const oneWayBinding = ({element, scope}) => {
    let template = element.innerHTML;

    const update = () => element.innerHTML = template.replace(/{{([\S\s]+)}}/g, (match, field) => {
      return getStateValue(field, scope);
    });

    return {
      update
    }
  };


  //  Cria uma ligação de mão dupla
  const twoWayBinding = ({element, scope}) => {
    let field = element.getAttribute('tr-value');

    const update = () => {
      element.value = getStateValue(field, scope);

      if (element.type === 'checkbox') {
        element.value === 'true' ? element.setAttribute('checked', '') : element.removeAttribute('checked');
      }
    };

    return {
      update
    }
  };


  // Cria uma ligação para as listagens
  const foreachBinding = ({element, scope}) => {
    return {
      element: element,
      template: element.innerHTML,
      model: scope,
      render() {
        let html = '';

        this.model.forEach((item, index) => {
          html += this.template.replace(">", ` data-index="${index}" >`);
        });

        this.element.innerHTML = html;

        for (let i = 0; i < this.element.children.length; i++) {
          const child = this.element.children[i];

          fetchBindingRequests(child, this.model[i]);
        }
      }
    }
  };


  //  Sincroniza os valores da view com os do modelo
  const update = () => {
    trBindings.forEach(bound => {
      bound.update();
    });
    onUpdate();
  };


  //  Atualiza o modelo de acordo com uma mudança na view
  const updateField = (evt) => {
    let field = evt.target.getAttribute("tr-value");
    let value = evt.target.value;

    setStateValue(field, value);
  };


  const getStateValue = (field, scope) => {
    let value;
    let terms = field.split(".");

    if (scope === 'global') {
      value = model;

      for (let i = 0; i < terms.length; i++) {
        value = value[terms[i]] || '';
      }

      return value || '';
    }

    value = scope;

    for (let i = 1; i < terms.length; i++) {
      value = value[terms[i]];
    }

    return value;
  };


  const setStateValue = (field, value) => {
    let state = model;
    let terms = field.split(".");
    let i = 0;

    while (i < terms.length - 1) {
      state = state[terms[i]];
      i++;
    }

    state[terms[i++]] = value;
  };

})(this);