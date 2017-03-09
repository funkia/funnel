import {
  Behavior, sink, isBehavior, Stream, empty, Now
} from "hareactive";
import {
  Component, runComponentNow,
  viewObserve, Showable, Child, isChild, toComponent
} from "./component";
import {CSSStyleType} from "./CSSStyleType";
import {rename, mergeDeep} from "./utils";

export type StreamDescription<A> = [string, string, (evt: any) => A];
export type BehaviorDescription<A> = [string, string, (evt: any) => A, (elm: HTMLElement) => A];

export type Properties = {
  wrapper?: boolean,
  streams?: StreamDescription<any>[],
  behaviors?: BehaviorDescription<any>[],
  style?: CSSStyleType,
  props?: {
    [name: string]: Showable | Behavior<Showable | boolean>;
  },
  attrs?: {
    [name: string]: Showable | Behavior<Showable>;
  },
  action?: {
    [name: string]: Stream<any[]>
  }
  output?: {[name: string]: string},
  class?: string,
  classToggle?: {
    [name: string]: boolean | Behavior<boolean>;
  }
};

class CreateDomNow<A> extends Now<A> {
  constructor(
    private parent: Node,
    private tagName: string,
    private props?: Properties,
    private children?: Child
  ) { super(); };
  run(): A {
    let output: any = {};
    const elm = document.createElement(this.tagName);

    if (this.props !== undefined) {
      if (this.props.style !== undefined) {
        for (const styleProp of Object.keys(this.props.style)) {
          const value = (<any>this).props.style[styleProp];
          if (isBehavior(value)) {
            viewObserve((newValue) => (<any>elm.style)[styleProp] = newValue, value);
          } else {
            (<any>elm.style)[styleProp] = value;
          }
        }
      }
      if (this.props.attrs !== undefined) {
        for (const name of Object.keys(this.props.attrs)) {
          const value = this.props.attrs[name];
          if (isBehavior(value)) {
            viewObserve((newValue) => elm.setAttribute(name, <string>newValue), value);
          } else {
            elm.setAttribute(name, value.toString());
          }
        }
      }
      if (this.props.props !== undefined) {
        for (const name of Object.keys(this.props.props)) {
          const value = this.props.props[name];
          if (isBehavior(value)) {
            viewObserve((newValue) => (<any>elm)[name] = newValue, value);
          } else {
            (<any>elm)[name] = value;
          }
        }
      }
      if (this.props.class !== undefined) {
        const classes = this.props.class.split(" ");
        for (const name of classes) {
          elm.classList.add(name);
        }
      }
      if (this.props.classToggle !== undefined) {
        for (const name of Object.keys(this.props.classToggle)) {
          const value = this.props.classToggle[name];
          if (isBehavior(value)) {
            viewObserve((newValue) => elm.classList.toggle(name, newValue), value);
          } else {
            elm.classList.toggle(name, value);
          }
        }
      }
      if (this.props.action !== undefined) {
        for (const name of Object.keys(this.props.action)) {
          this.props.action[name].subscribe((args) => ((<any>elm)[name]).apply(elm, args));
        }
      }
      if (this.props.behaviors !== undefined) {
        for (const [evt, name, extractor, initialFn] of this.props.behaviors) {
          let a: Behavior<any> = undefined;
          const initial = initialFn(elm);
          Object.defineProperty(output, name, {
            enumerable: true,
            get: () => {
              if (a === undefined) {
                a = behaviorFromEvent(evt, initial, extractor, elm);
              }
              return a;
            }});
        }
      }
      if (this.props.streams !== undefined) {
        for (const [evt, name, extractor] of this.props.streams) {
          let a: Stream<any> = undefined;
          Object.defineProperty(output, name, {
            enumerable: true,
            get: () => {
              if (a === undefined) {
                a = streamFromEvent(evt, extractor, elm);
              }
              return a;
            }
          });
        }
      }
    }
    if (this.children !== undefined) {
      const childOutput = runComponentNow(elm, toComponent(this.children));
      if (this.props.wrapper === true) {
        output = childOutput;
      } else {
        output.children = childOutput;
      }
    }
    if (this.props.output !== undefined) {
      rename(output, this.props.output);
    }
    this.parent.appendChild(elm);
    return output;
  }
}

function parseCSSTagname(cssTagName: string): [string, Properties] {
  const parsedTag = cssTagName.split(/(?=\.)|(?=#)|(?=\[)/);
  const result: Properties = {};
  for (let i = 1; i < parsedTag.length; i++) {
    const token = parsedTag[i];
    switch (token[0]) {
    case "#":
      result.props = result.props || {};
      result.props["id"] = token.slice(1);
      break;
    case ".":
      result.classToggle = result.classToggle || {};
      result.classToggle[token.slice(1)] = true;
      break;
    case "[":
      result.attrs = result.attrs || {};
      const attr = token.slice(1, -1).split("=");
      result.attrs[attr[0]] = attr[1] || "";
      break;
    default:
      throw new Error("Unknown symbol");
    }
  }
  return [parsedTag[0], result];
}

export type CreateElementFunc<A> = (newPropsOrChildren?: Child | Properties, newChildren?: Properties) => Component<A>;

export function e<A>(tagName: string, props: Properties = {}): CreateElementFunc<A> {
  const [parsedTagName, tagProps] = parseCSSTagname(tagName);
  props = mergeDeep(props, tagProps);
  function createElement(): Component<any>;
  function createElement(props1: Properties): Component<A>;
  function createElement(child: Child): Component<A>;
  function createElement(props2: Properties, bChildren: Child): Component<A>;
  function createElement(newPropsOrChildren?: Properties | Child, newChildrenOrUndefined?: Child): Component<A> {
    if (newChildrenOrUndefined === undefined && isChild(newPropsOrChildren)) {
      return new Component((p) => new CreateDomNow<A>(p, parsedTagName, props, newPropsOrChildren));
    } else {
      const newProps = mergeDeep(props, newPropsOrChildren);
      return new Component((p) => new CreateDomNow<A>(p, parsedTagName, newProps, newChildrenOrUndefined));
    }
  }
  return createElement;
}

function behaviorFromEvent<A>(
  eventName: string,
  initial: A,
  extractor: (evt: any) => A,
  dom: Node
): Behavior<A> {
  const b = sink<A>(initial);
  dom.addEventListener(eventName, (ev) => b.push(extractor(ev)));
  return b;
}

function streamFromEvent<A>(
  eventName: string,
  extractor: (evt: any) => A,
  dom: Node
): Stream<A> {
  const s = empty<A>();
  dom.addEventListener(eventName, (ev) => {
    s.push(extractor(ev));
  });
  return s;
}
