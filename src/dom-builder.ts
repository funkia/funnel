import {
  Behavior,
  Future,
  isBehavior,
  Stream,
  isStream,
  Time
} from "@funkia/hareactive";
import {
  behaviorFromEvent,
  streamFromEvent,
  render
} from "@funkia/hareactive/dom";
import {
  Child,
  Component,
  ComponentSelectedOutput,
  isChild,
  Out,
  Showable,
  toComponent,
  ToComponent
} from "./component";
import { id, mergeDeep } from "./utils";

export type EventName = keyof HTMLElementEventMap;

export type StreamDescription<A> = [EventName, (evt: any) => A, A];

export function streamDescription<A, N extends EventName>(
  eventName: N,
  f: (evt: HTMLElementEventMap[N]) => A
): StreamDescription<A> {
  return <any>[eventName, f]; // The third value don't exist it's for type info only
}

export type StreamDescriptions = {
  [name: string]: StreamDescription<any>;
};

export type OutputStream<T extends StreamDescriptions> = {
  [K in keyof T]: Stream<T[K][2]>;
};

export type BehaviorDescription<A> = [
  EventName,
  (evt: any) => A,
  (elm: HTMLElement) => A,
  A
];

export function behaviorDescription<A, N extends EventName>(
  eventName: N,
  f: (evt: HTMLElementEventMap[N]) => A,
  init: (elm: HTMLElement) => A
): BehaviorDescription<A> {
  return <any>[eventName, f, init]; // The fourth value don't exist it's for type info only
}

export type BehaviorDescriptions = {
  [name: string]: BehaviorDescription<any>;
};

export type BehaviorOutput<T extends BehaviorDescriptions> = {
  [K in keyof T]: Behavior<T[K][3]>;
};

export type ActionDefinitions = {
  [name: string]: (element: HTMLElement, value: any) => void;
};

export type Actions = {
  [name: string]: Stream<any>;
};

export type Setters = {
  [name: string]: Behavior<any>;
};

export type Style = {
  [N in keyof CSSStyleDeclaration]?:
    | Behavior<CSSStyleDeclaration[N]>
    | CSSStyleDeclaration[N];
};

export type ClassNames = Behavior<string> | string;

export type ClassToggles = {
  [name: string]: boolean | Behavior<boolean>;
};

export type ClassDescription =
  | ClassNames
  | ClassToggles
  | ClassDescriptionArray;

export interface ClassDescriptionArray extends Array<ClassDescription> {}

export type Attributes = {
  [name: string]:
    | (Showable | boolean)
    | Stream<Showable | boolean>
    | Behavior<Showable | boolean>;
};

type _InitialProperties = {
  streams?: StreamDescriptions;
  behaviors?: BehaviorDescriptions;
  style?: Style;
  props?: Attributes;
  attrs?: Attributes;
  actionDefinitions?: ActionDefinitions;
  actions?: Actions;
  setters?: { [name: string]: Behavior<any> };
  class?: ClassDescription;
  entry?: { class?: string };
};

export type InitialProperties =
  | _InitialProperties
  | (_InitialProperties & Attributes);

export type DefaultOutput = {
  [E in EventName]: Stream<HTMLElementEventMap[E]>;
};

export type InitialOutput<
  P extends InitialProperties
> = (P["streams"] extends StreamDescriptions
  ? OutputStream<P["streams"]>
  : {}) &
  (P["behaviors"] extends BehaviorDescriptions
    ? BehaviorOutput<P["behaviors"]>
    : {}) &
  DefaultOutput;

// An array of names of all DOM events
// prettier-ignore
export const allDomEvents: EventName[] = ["readystatechange","beforescriptexecute","afterscriptexecute","selectionchange","fullscreenchange","fullscreenerror","pointerlockchange","pointerlockerror","visibilitychange","copy","cut","paste","abort","blur","focus","auxclick","canplay","canplaythrough","change","click","close","contextmenu","cuechange","dblclick","drag","dragend","dragenter","dragexit","dragleave","dragover","dragstart","drop","durationchange","emptied","ended","input","invalid","keydown","keypress","keyup","load","loadeddata","loadedmetadata","loadend","loadstart","mousedown","mouseenter","mouseleave","mousemove","mouseout","mouseover","mouseup","wheel","pause","play","playing","progress","ratechange","reset","resize","scroll","seeked","seeking","select","show","stalled","submit","suspend","timeupdate","volumechange","waiting","selectstart","toggle","pointercancel","pointerdown","pointerup","pointermove","pointerout","pointerover","pointerenter","pointerleave","gotpointercapture","lostpointercapture","animationcancel","animationend","animationiteration","animationstart","transitioncancel","transitionend","transitionrun","transitionstart","error"] as any;

// Output streams that _all_ elements share
const defaultStreams: StreamDescriptions = {};

for (const name of allDomEvents) {
  defaultStreams[name] = streamDescription(name, id);
}

const defaultProperties = {
  streams: defaultStreams
};

const attributeSetter = (element: HTMLElement) => (
  key: string,
  value: Showable | boolean
) => {
  if (value === true) {
    element.setAttribute(key, "");
  } else if (value === false) {
    element.removeAttribute(key);
  } else {
    element.setAttribute(key, value.toString());
  }
};

const propertySetter = (element: HTMLElement) => (
  key: string,
  value: Showable | boolean
) => ((<any>element)[key] = value);

const classSetter = (element: HTMLElement) => (key: string, value: boolean) =>
  element.classList.toggle(key, value);

const styleSetter = (element: HTMLElement) => (key: string, value: string) =>
  (element.style[<any>key] = value);

function handleObject<A>(
  object: { [key: string]: A | Behavior<A> | Stream<A> } | undefined,
  element: HTMLElement,
  createSetter: (element: HTMLElement) => (key: string, value: A) => void,
  t: Time
): void {
  if (object !== undefined) {
    const setter = createSetter(element);
    for (const key of Object.keys(object)) {
      const value = object[key];
      if (isBehavior(value)) {
        render((newValue) => setter(key, newValue), value, t);
      } else if (isStream(value)) {
        value.subscribe((newValue) => setter(key, newValue));
      } else {
        setter(key, value);
      }
    }
  }
}

function handleCustom(
  elm: HTMLElement,
  isStreamActions: boolean,
  actionDefinitions: ActionDefinitions,
  actions: Actions | Setters | undefined
): void {
  if (actions !== undefined) {
    for (const name of Object.keys(actions)) {
      const actionTrigger = actions[name];
      const actionDefinition = actionDefinitions[name];
      if (isStreamActions) {
        actionTrigger.subscribe((value) => actionDefinition(elm, value));
      } else {
        render((value) => actionDefinition(elm, value), <any>actionTrigger);
      }
    }
  }
}

function handleClass(
  desc: ClassDescription | ClassDescription[],
  elm: HTMLElement,
  t: Time
): void {
  if (isBehavior(desc)) {
    let previousClasses: string[];
    render((value) => {
      if (previousClasses !== undefined) {
        elm.classList.remove(...previousClasses);
      }
      previousClasses = value.split(" ");
      elm.classList.add(...previousClasses);
    }, desc);
  } else if (Array.isArray(desc)) {
    for (const d of desc) {
      handleClass(d, elm, t);
    }
  } else if (typeof desc === "string") {
    const classes = desc.split(" ");
    elm.classList.add(...classes);
  } else {
    handleObject(desc, elm, classSetter, t);
  }
}

function handleEntryClass(desc: string, elm: HTMLElement): void {
  const classes = desc.split(" ");
  elm.classList.add(...classes);
  // Wait two frames so that we get one frame with the class
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      elm.classList.remove(...classes);
    });
  });
}

const propKeywords = new Set([
  "style",
  "attrs",
  "props",
  "class",
  "actionDefinitions",
  "actions",
  "setters",
  "entry",
  "behaviors",
  "streams",
  "namespace"
]);

/**
 * Set of things that should be handled as properties and not attributes.
 */
const isProperty = new Set(["value"]);

export function handleProps<A>(
  props: InitialProperties,
  elm: HTMLElement,
  t: Time
): A {
  let output: any = {};

  let attrs = Object.assign({}, props.attrs);
  let properties = Object.assign({}, props.props);
  for (const [key, value] of Object.entries(props)) {
    if (!propKeywords.has(key)) {
      if (isProperty.has(key)) {
        properties[key] = value as any;
      } else {
        attrs[key] = value as any;
      }
    }
  }

  handleObject(<any>props.style, elm, styleSetter, t);
  handleObject(attrs, elm, attributeSetter, t);
  handleObject(properties, elm, propertySetter, t);
  if (props.class !== undefined) {
    handleClass(props.class, elm, t);
  }
  if (props.entry !== undefined) {
    if (props.entry.class !== undefined) {
      handleEntryClass(props.entry.class, elm);
    }
  }
  if (props.actionDefinitions !== undefined) {
    handleCustom(elm, true, props.actionDefinitions, props.actions);
    handleCustom(elm, false, props.actionDefinitions, props.setters);
  }
  if (props.behaviors !== undefined) {
    for (const name of Object.keys(props.behaviors)) {
      const [evt, extractor, getter] = props.behaviors[name];
      let a: Behavior<any> | undefined = undefined;
      Object.defineProperty(output, name, {
        enumerable: true,
        get: (): Behavior<any> => {
          if (a === undefined) {
            a = behaviorFromEvent(elm, evt, getter, extractor);
          }
          return a;
        },
        set: (value) => {
          return (a = value);
        }
      });
    }
  }
  if (props.streams !== undefined) {
    for (const name of Object.keys(props.streams)) {
      const [evt, extractor] = props.streams[name];
      let a: Stream<any> | undefined = undefined;
      if (output[name] === undefined) {
        Object.defineProperty(output, name, {
          enumerable: true,
          get: (): Stream<any> => {
            if (a === undefined) {
              a = streamFromEvent(elm, evt, extractor);
            }
            return a;
          },
          set: (value) => {
            return (a = value);
          }
        });
      }
    }
  }
  return output;
}

class DomComponent<O, P, A> extends Component<A, O & P> {
  constructor(
    private tagName: string,
    private props: InitialProperties,
    private child?: Component<any, P>
  ) {
    super();
    if (child !== undefined) {
      this.child = toComponent(child);
    }
  }
  run(parent: Node, destroyed: Future<boolean>, t: Time): Out<A & P, O & P> {
    const namespace = (this.props as any).namespace;
    const elm: HTMLElement = namespace
      ? (document.createElementNS(namespace, this.tagName) as HTMLElement)
      : document.createElement(this.tagName);

    const available: any = handleProps(this.props, elm, t);
    let output: any = {};

    parent.appendChild(elm);

    if (this.child !== undefined) {
      const childResult = this.child.run(
        elm,
        destroyed.mapTo(false as boolean),
        t
      );
      Object.assign(output, childResult.output);
    }
    destroyed.subscribe((toplevel) => {
      if (toplevel) {
        parent.removeChild(elm);
      }
      // TODO: cleanup listeners
    });
    return { output, available };
  }
}

type ChildSelectedOutput<Ch extends Child> = ComponentSelectedOutput<
  ToComponent<Ch>
>;

// `O` is the parents output
export type Wrapped<P, O> = (undefined extends P
  ? {
      // Optional props
      // Only props
      (props?: P): Component<O, {}>;
      // Only child
      <Ch extends Child>(child: Ch): Component<O, ChildSelectedOutput<Ch>>;
    }
  : {
      // Required props
      // Only props
      (props: P): Component<O, {}>;
    }) & {
  // Both props and child
  <Ch extends Child>(props: P, child: Ch): Component<
    O,
    ChildSelectedOutput<Ch>
  >;
};

export function wrapper<P, O>(
  fn: (props: P, child: Component<any, any> | undefined) => Component<any, O>
): Wrapped<P, O> {
  function wrappedComponent(
    newPropsOrChild: P | Child,
    childOrUndefined: Child | undefined
  ) {
    const props =
      newPropsOrChild !== undefined && !isChild(newPropsOrChild)
        ? newPropsOrChild
        : undefined;
    const child =
      childOrUndefined !== undefined
        ? toComponent(childOrUndefined)
        : isChild(newPropsOrChild)
        ? toComponent(newPropsOrChild)
        : undefined;
    return fn(props!, child);
  }
  return <any>wrappedComponent;
}

export function element<P extends InitialProperties>(
  tagName: string,
  defaultElementProps?: P
): Wrapped<InitialProperties | undefined, InitialOutput<P>> {
  const mergedProps: P = mergeDeep(defaultElementProps, defaultProperties);
  // @ts-ignore
  return wrapper(
    (p, child): Component<any, any> => {
      const finalProps = mergeDeep(mergedProps, p);
      return new DomComponent(tagName, finalProps, child);
    }
  );
}

export function svgElement<P extends InitialProperties>(
  tagName: string,
  defaultElementProps?: P
): Wrapped<InitialProperties | undefined, InitialOutput<P>> {
  // @ts-ignore
  return element(tagName, {
    ...defaultElementProps,
    namespace: "http://www.w3.org/2000/svg"
  });
}
