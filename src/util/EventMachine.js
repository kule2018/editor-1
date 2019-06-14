import Event, {
  CHECK_PATTERN,
  NAME_SAPARATOR,
  CHECK_SAPARATOR,
  SAPARATOR,
  CHECK_LOAD_PATTERN,
  LOAD_SAPARATOR,
  BIND_SAPARATOR,
  CHECK_BIND_PATTERN,
  BIND_CHECK_DEFAULT_FUNCTION,
  BIND_CHECK_FUNCTION,
  LOAD
} from "./Event";
import Dom from "./Dom";
import {
  debounce,
  isFunction,
  isArray,
  html,
  keyEach,
  isNotUndefined,
  isUndefined,
  isString,
  isObject
} from "./functions/func";
import { EMPTY_STRING } from "./css/types";
import {
  ADD_BODY_MOUSEMOVE,
  ADD_BODY_MOUSEUP
} from "../csseditor/types/event";
import { uuid } from "./functions/math";

const REFERENCE_PROPERTY = "ref";
const TEMP_DIV = new Dom("div");
const QUERY_PROPERTY = `[${REFERENCE_PROPERTY}]`;
const ATTR_lIST = [REFERENCE_PROPERTY]

const matchPath = (el, selector) => {
  if (el) {
    if (el.matches(selector)) {
      return el;
    }
    return matchPath(el.parentElement, selector);
  }
  return null;
};

const hasDelegate = (e, eventObject) => {
  return matchPath(e.target || e.srcElement, eventObject.delegate);
};

const makeCallback = (context, eventObject, callback) => {
  if (eventObject.delegate) {
    return makeDelegateCallback(context, eventObject, callback);
  } else {
    return makeDefaultCallback(context, eventObject, callback);
  }
};

const makeDefaultCallback = (context, eventObject, callback) => {
  return e => {
    var returnValue = runEventCallback(context, e, eventObject, callback);
    if (isNotUndefined(returnValue)) {
      return returnValue;
    }
  };
};

const makeDelegateCallback = (context, eventObject, callback) => {
  return e => {
    const delegateTarget = hasDelegate(e, eventObject);
    if (delegateTarget) {
      // delegate target 이 있는 경우만 callback 실행
      e.$delegateTarget = new Dom(delegateTarget);

      var returnValue = runEventCallback(context, e, eventObject, callback);
      if (isNotUndefined(returnValue)) {
        return returnValue;
      }
    }
  };
};

const runEventCallback = (context, e, eventObject, callback) => {
  e.xy = Event.posXY(e);

  if (eventObject.beforeMethods.length) {
    eventObject.beforeMethods.every(before => {
      return context[before.target].call(context, e, before.param);
    });
  }

  if (checkEventType(context, e, eventObject)) {
    var returnValue = callback(e, e.$delegateTarget, e.xy);

    if (eventObject.afterMethods.length) {
      eventObject.afterMethods.forEach(after =>
        context[after.target].call(context, e, after.param)
      );
    }

    return returnValue;
  }
};

const checkEventType = (context, e, eventObject) => {
  // 특정 keycode 를 가지고 있는지 체크
  var hasKeyCode = true;
  if (eventObject.codes.length) {
    hasKeyCode =
      (e.code ? eventObject.codes.includes(e.code.toLowerCase()) : false) ||
      (e.key ? eventObject.codes.includes(e.key.toLowerCase()) : false);
  }

  // 체크 메소드들은 모든 메소드를 다 적용해야한다.
  var isAllCheck = true;
  if (eventObject.checkMethodList.length) {
    isAllCheck = eventObject.checkMethodList.every(field => {
      var fieldValue = context[field];
      if (isFunction(fieldValue) && fieldValue) {
        // check method
        return fieldValue.call(context, e);
      } else if (isNotUndefined(fieldValue)) {
        // check field value
        return !!fieldValue;
      }
      return true;
    });
  }

  return hasKeyCode && isAllCheck;
};

const getDefaultDomElement = (context, dom) => {
  let el;

  if (dom) {
    el = context.refs[dom] || context[dom] || window[dom];
  } else {
    el = context.el || context.$el || context.$root;
  }

  if (el instanceof Dom) {
    return el.getElement();
  }

  return el;
};

export const splitMethodByKeyword = (arr, keyword) => {
  var filterKeys = arr.filter(code => code.indexOf(`${keyword}(`) > -1);
  var filterMaps = filterKeys.map(code => {
    var [target, param] = code
      .split(`${keyword}(`)[1]
      .split(")")[0]
      .trim()
      .split(" ");

    return { target, param };
  });

  return [filterKeys, filterMaps];
};

const getDefaultEventObject = (context, eventName, checkMethodFilters) => {
  let arr = checkMethodFilters;

  // context 에 속한 변수나 메소드 리스트 체크
  const checkMethodList = arr.filter(code => !!context[code]);

  // 이벤트 정의 시점에 적용 되어야 하는 것들은 모두 method() 화 해서 정의한다.
  const [afters, afterMethods] = splitMethodByKeyword(arr, "after");
  const [befores, beforeMethods] = splitMethodByKeyword(arr, "before");
  const [debounces, debounceMethods] = splitMethodByKeyword(arr, "debounce");
  const [captures] = splitMethodByKeyword(arr, "capture");

  // 위의 5개 필터 이외에 있는 코드들은 keycode 로 인식한다.
  const filteredList = [
    ...checkMethodList,
    ...afters,
    ...befores,
    ...debounces,
    ...captures
  ];

  var codes = arr
    .filter(code => !filteredList.includes(code))
    .map(code => code.toLowerCase());

  return {
    eventName,
    codes,
    captures,
    afterMethods,
    beforeMethods,
    debounceMethods,
    checkMethodList
  };
};

const addEvent = (context, eventObject, callback) => {
  eventObject.callback = makeCallback(context, eventObject, callback);
  context.addBinding(eventObject);
  Event.addEvent(
    eventObject.dom,
    eventObject.eventName,
    eventObject.callback,
    !!eventObject.captures.length
  );
};

const bindingEvent = (
  context,
  [eventName, dom, ...delegate],
  checkMethodFilters,
  callback
) => {
  let eventObject = getDefaultEventObject(
    context,
    eventName,
    checkMethodFilters
  );

  eventObject.dom = getDefaultDomElement(context, dom);
  eventObject.delegate = delegate.join(SAPARATOR);

  if (eventObject.debounceMethods.length) {
    var debounceTime = +eventObject.debounceMethods[0].target;
    callback = debounce(callback, debounceTime);
  }

  addEvent(context, eventObject, callback);
};

const getEventNames = eventName => {
  let results = [];

  eventName.split(NAME_SAPARATOR).forEach(e => {
    var arr = e.split(NAME_SAPARATOR);

    results.push(...arr);
  });

  return results;
};

const parseEvent = (context, key) => {
  let checkMethodFilters = key.split(CHECK_SAPARATOR).map(it => it.trim());
  var eventSelectorAndBehave = checkMethodFilters.shift();

  var [eventName, ...params] = eventSelectorAndBehave.split(SAPARATOR);
  var eventNames = getEventNames(eventName);
  var callback = context[key].bind(context);

  eventNames.forEach(eventName => {
    bindingEvent(context, [eventName, ...params], checkMethodFilters, callback);
  });
};

const applyElementAttribute = ($element, key, value) => {
  if (key === "style") {
    if (isObject(value)) {
      // 문자열이 아니라 객체 일때는 직접 입력하는 방식으로
      keyEach(value, (sKey, sValue) => {
        if (!sValue) {
          $element.removeStyle(sKey);
        } else {
          $element.css(sKey, sValue);
        }
      });
    }

    return;
  } else if (key === "class") {
    // 문자열이 아닐 때는 문자열로 만들어 준다.

    if (isArray(value)) {
      $element.addClass(...value);
    } else if (isObject(value)) {
      keyEach(value, (k, v) => {
        if (!value) {
          $element.removeClass(k);
        } else {
          $element.addClass(k);
        }
      });
    } else {
      $element.addClass(value);
    }

    return;
  }

  if (isUndefined(value)) {
    $element.removeAttr(key);
  } else {
    if ($element.el.nodeName === "TEXTAREA" && key === "value") {
      $element.text(value);
    } else {
      $element.attr(key, value);
    }
  }
};

export default class EventMachine {
  constructor() {
    this.state = {};
    this.prevState = {};
    this.refs = {};
    this.children = {};
    this._bindings = [];
    this.id = uuid();    
    this.childComponents = this.components();
  }

  initState() {
    return {};
  }

  setState(state = {}, isLoad = true) {
    this.prevState = this.state;
    this.state = { ...this.state, ...state };
    if (isLoad) {
      this.load();
    }
  }

  render($container) {
    this.$el = this.parseTemplate(
      html`
        ${this.template()}
      `
    );
    this.refs.$el = this.$el;

    if ($container) $container.append(this.$el);

    this.load();
    this.parseComponent(false);

    this.afterRender();
  }

  initialize() {
    this.state = this.initState();
  }
  afterRender() {}
  components() {
    return {};
  }

  // ref 에 있는 객체를 좀 더 편하게 가지고 오고자 만들었다.
  // 예를 들어 ref='$xxxRadius' 라고 했을 때
  // this.refs[`$${type}Radius`] 처럼 이름을 재 구성하는 방식을 써야 하는데
  // this.getRef('$', type, 'Radius') 형태로 끝낼 수 있다.
  // 변수적용하기 좀 더 편해진다.
  // 사용은 각자가 알아서 ㅋ
  getRef(...args) {
    const key = args.join(EMPTY_STRING)
    return this.refs[key];
  }

  parseTemplate(html, isLoad) {
    if (isArray(html)) {
      html = html.join(EMPTY_STRING);
    }

    html = html.trim();
    const list = TEMP_DIV.html(html).children();

    list.forEach($el => {
      // ref element 정리
      var ref = $el.attr(REFERENCE_PROPERTY)
      if (ref) {
        this.refs[ref] = $el;
      }

      var refs = $el.$$(QUERY_PROPERTY);
      var temp = {} 
      refs.forEach($dom => {
        const name = $dom.attr(REFERENCE_PROPERTY);
        if (temp[name]) {
          console.warn(`${ref} is duplicated. - ${this.sourceName}`)
        } else {
          temp[name] = true; 
        }

        this.refs[name] = $dom;        
      });


    });

    if (!isLoad) {
      return list[0];
    }

    return TEMP_DIV.createChildrenFragment();
  }

  parseComponent() {
    const $el = this.$el;

    keyEach(this.childComponents, (ComponentName, Component) => {
      const targets = $el.$$(`${ComponentName.toLowerCase()}`);
      targets.forEach($dom => {
        let props = {};

        // parse properties 
        [...$dom.el.attributes]
          .filter(t => {
            return ATTR_lIST.indexOf(t.nodeName) < 0;
          })
          .forEach(t => {
            props[t.nodeName] = t.nodeValue;
          });

        $dom.$$('property').forEach($p => {
          const [name, value, type] = $p.attrs('name', 'value', 'type')

          let realValue = value || $p.text();

          if (type === 'json') {
            realValue = JSON.parse(realValue);
          }
          
          props[name] = realValue; 
        })

        // create component 
        var instance = new Component(this, props);
        let refName = $dom.attr(REFERENCE_PROPERTY) || instance.id;

        if (this.children[refName]) {
          // ref 가 동일한게 있으면 event 를 모두 해제한다. 
          this.children[refName].destroy()
        }

        this.children[refName] = instance;

        if (instance) {
          instance.render();

          $dom.replace(instance.$el);

          instance.initializeEvent();  
        }

      });
    });

    // DOM 에서 빠지 애들  ( this.$el.parent() 가 null  인 경우 )
    // destroy () 시킨다. 

    keyEach(this.children, (key, obj) => {
      if (obj && obj.clean()) {
        delete this.children[key]
      }
    })
  }

  clean () {
    if (!this.$el.hasParent()) {
      keyEach(this.children, (key, child) => {
        child.clean();
      })

      this.destroy();  
      return true; 
    }
  }

  /**
   * refresh 는 load 함수들을 실행한다. 
   */
  refresh() {
    this.load()
  }

  /**
   * 특정 load 함수를 실행한다.  문자열을 그대로 return 한다. 
   * @param  {...any} args 
   */
  loadTemplate (...args) {
    return this[LOAD(args.join(EMPTY_STRING))].call(this)
  }

  load(...args) {
    if (!this._loadMethods) {
      this._loadMethods = this.filterProps(CHECK_LOAD_PATTERN);
      this._bindMethods = this.filterProps(CHECK_BIND_PATTERN);
    }

    this._loadMethods.forEach(callbackName => {
      const elName = callbackName.split(LOAD_SAPARATOR)[1];
      if (this.refs[elName]) {
        
        var newTemplate = this[callbackName].call(this, ...args);

        if (isArray(newTemplate)) {
          newTemplate = newTemplate.join(EMPTY_STRING);
        }

        const fragment = this.parseTemplate(newTemplate, true);

        this.refs[elName].html(fragment);

        // 새로운 html 이 로드가 되었으니 
        // 이벤트를 재설정 하자. 
        // 그래야 refs 에 있던 객체를 다시 사용할 수 있다. 
        this.initializeDomEvent()
      }
    });

    /**
     * BIND 를 해보자.
     * 이시점에 하는게 맞는지는 모르겠지만 일단은 해보자.
     * BIND 는 특정 element 에 html 이 아닌 데이타를 업데이트하기 위한 간단한 로직이다.
     */
    this._bindMethods.forEach(callbackName => {
      const bindMethod = this[callbackName];
      var [callbackName, id] = callbackName.split(CHECK_SAPARATOR);

      const refObject = this.getRef(id);
      let refCallback = BIND_CHECK_DEFAULT_FUNCTION;

      if (refObject != EMPTY_STRING && isString(refObject)) {
        refCallback = BIND_CHECK_FUNCTION(refObject);
      } else if (isFunction(refObject)) {
        refCallback = refObject;
      }

      const elName = callbackName.split(BIND_SAPARATOR)[1];
      let $element = this.refs[elName];

      // isBindCheck 는 binding 하기 전에 변화된 지점을 찾아서 업데이트를 제한한다.
      const isBindCheck = isFunction(refCallback) && refCallback.call(this);
      if ($element && isBindCheck) {
        const results = bindMethod.call(this, ...args);

        if (!results) return;

        keyEach(results, (key, value) => {
          applyElementAttribute($element, key, value);
        });
      }
    });

    this.parseComponent();
    
  }

  // 기본 템플릿 지정
  template() {
    var className = this.templateClass();
    var classString = className ? `class="${className}"` : EMPTY_STRING;

    return `<div ${classString}></div>`;
  }

  templateClass() {
    return null;
  }

  eachChildren(callback) {
    if (!isFunction(callback)) return;

    keyEach(this.children, (_, Component) => {
      callback(Component);
    });
  }

  /**
   * 이벤트를 초기화한다.
   */
  initializeEvent() {
    this.initializeDomEvent();

    // 자식 이벤트도 같이 초기화 한다.
    // 그래서 이 메소드는 부모에서 한번만 불려도 된다.
    this.eachChildren(Component => {
      Component.initializeEvent();
    });
  }

  /**
   * 자원을 해제한다.
   * 이것도 역시 자식 컴포넌트까지 제어하기 때문에 가장 최상위 부모에서 한번만 호출되도 된다.
   */
  destroy() {
    this.destroyDomEvent();

    this.eachChildren(Component => {
      Component.destroy();
    });
  }

  destroyDomEvent() {
    this.removeEventAll();
  }

  initializeDomEvent() {
    this.destroyDomEvent();
    this.filterProps(CHECK_PATTERN).forEach(key => parseEvent(this, key));
  }

  /**
   * property 수집하기
   * 상위 클래스의 모든 property 를 수집해서 리턴한다.
   */
  collectProps() {

    var p = this.__proto__;
    var results = [];
    do {
      var isObject = p instanceof Object;

      if (isObject === false) {
        break;
      }
      const names = Object.getOwnPropertyNames(p).filter(name => {
        return isFunction(this[name]);
      });

      results.push(...names);
      p = p.__proto__;
    } while (p);

    return results;
  }

  filterProps(pattern) {
    return this.collectProps().filter(key => {
      return key.match(pattern);
    });
  }

  /* magic check method  */

  self(e) {
    return e && e.$delegateTarget && e.$delegateTarget.is(e.target);
  }
  isAltKey(e) {
    return e.altKey;
  }
  isCtrlKey(e) {
    return e.ctrlKey;
  }
  isShiftKey(e) {
    return e.shiftKey;
  }
  isMetaKey(e) {
    return e.metaKey;
  }

  /* magic check method */

  /** before check method */

  /** before check method */

  /* after check method */

  preventDefault(e) {
    e.preventDefault();
    return true;
  }

  stopPropagation(e) {
    e.stopPropagation();
    return true;
  }

  bodyMouseMove(e, methodName) {
    if (this[methodName]) {
      this.emit(ADD_BODY_MOUSEMOVE, this[methodName], this, e.xy);
    }
  }

  bodyMouseUp(e, methodName) {
    if (this[methodName]) {
      this.emit(ADD_BODY_MOUSEUP, this[methodName], this, e.xy);
    }
  }
  /* after check method */

  getBindings() {
    if (!this._bindings) {
      this.initBindings();
    }

    return this._bindings;
  }

  addBinding(obj) {
    this.getBindings().push(obj);
  }

  initBindings() {
    this._bindings = [];
  }

  removeEventAll() {
    this.getBindings().forEach(obj => {
      this.removeEvent(obj);
    });
    this.initBindings();
  }

  removeEvent({ eventName, dom, callback }) {
    Event.removeEvent(dom, eventName, callback);
  }
}
