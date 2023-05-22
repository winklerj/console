import { useLocation, useMatch } from "@solidjs/router";
import {
  For,
  batch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { useAuth } from "../../data/auth";
import { UserStore } from "../../data/user";
import { WorkspaceStore } from "../../data/workspace";
import { styled } from "@macaron-css/solid";
import { useReplicache } from "../../data/replicache";
import { AppStore } from "../../data/app";
import { theme } from "src/ui/theme";
import { filter, groupBy, pipe } from "remeda";
import { globalStyle } from "@macaron-css/core";
import { createShortcut, useKeyDownEvent } from "@solid-primitives/keyboard";
import { useNavigate, useParams } from "@solidjs/router";
import { StageStore } from "../../data/stage";
import { ResourceStore } from "../../data/resource";

interface Action {
  icon: string;
  title: string;
  category?: string;
  hotkeys?: string[];
  run: (control: Control) => void | Promise<void>;
}

type ActionProvider = (filter: string) => Promise<Action[]>;

const WorkspaceProvider: ActionProvider = async (filter) => {
  const workspaces = await Promise.all(
    Object.values(useAuth()).map(async (account) => {
      const workspaces = await account.replicache.query(async (tx) => {
        const users = await UserStore.list()(tx);
        return Promise.all(
          users.map(async (user) => {
            const workspace = await WorkspaceStore.fromID(user.workspaceID)(tx);
            return { account: account, workspace };
          })
        );
      });
      return workspaces;
    })
  ).then((x) => x.flat());
  return workspaces.map((w) => ({
    title: "Switch to workspace " + w.workspace.slug,
    category: "Workspace",
    icon: "",
    run: (control) => {
      const nav = useNavigate();
      nav(`/${w.account.token.accountID}/${w.workspace.id}`);
      control.hide();
    },
  }));
};

const AppProvider: ActionProvider = async (filter) => {
  const rep = useReplicache()();
  const apps = await rep.query(AppStore.list());
  return apps.map((app) => ({
    icon: "",
    category: "App",
    title: `Switch to "${app.name}" app`,
    run: (control) => {
      const nav = useNavigate();
      const params = useParams();
      nav(`/${params.accountID}/${params.workspaceID}/apps/${app.id}`);
      control.hide();
    },
  }));
};

const StageProvider: ActionProvider = async (filter) => {
  const appID = location.pathname.split("/")[4];
  if (!appID) return [];
  const rep = useReplicache()();
  const stages = await rep.query(StageStore.forApp(appID));
  return stages.map((stage) => ({
    icon: "",
    category: "Stage",
    title: `Switch to "${stage.name}" stage`,
    run: (control) => {
      const nav = useNavigate();
      const params = useParams();
      nav(
        `/${params.accountID}/${params.workspaceID}/apps/${stage.appID}/stages/${stage.id}`
      );
      control.hide();
    },
  }));
};

const ResourceProvider: ActionProvider = async (filter) => {
  if (!filter) return [];
  const stageId = location.pathname.split("/")[6];
  console.log(stageId);
  if (!stageId) return [];
  const rep = useReplicache()();
  const resources = await rep.query(ResourceStore.forStage(stageId));
  return resources.map((resource) => ({
    icon: "",
    category: resource.type,
    title: `Go to "${resource.cfnID}"`,
    run: (control) => {},
  }));
};

const AccountProvider: ActionProvider = async () => {
  return [
    {
      icon: "",
      category: "Account",
      title: "Switch workspaces...",
      run: (control) => {
        control.setProvider(() => WorkspaceProvider);
      },
    },
    {
      icon: "",
      category: "Account",
      title: "Switch apps...",
      run: (control) => {
        control.setProvider(() => AppProvider);
      },
    },
  ];
};

const providers = [
  ResourceProvider,
  StageProvider,
  AppProvider,
  WorkspaceProvider,
  AccountProvider,
];

const Root = styled("div", {
  base: {
    position: "fixed",
    background: "rgba(0, 0, 0, 0.2)",
    backdropFilter: "blur(0px)",
    opacity: 0,
    inset: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "none",
    transition: "backdropFilter 300ms all",
  },
  variants: {
    show: {
      true: {
        opacity: 1,
        pointerEvents: "all",
        backdropFilter: "blur(5px)",
      },
    },
  },
});

const Modal = styled("div", {
  base: {
    width: 640,
    borderRadius: 8,
    flexShrink: 0,
    boxShadow: `rgb(0 0 0 / 50%) 0px 16px 70px`,
    background: "white",
  },
});

const Filter = styled("div", {
  base: {
    padding: `${theme.space[4]}`,
    display: "flex",
  },
});

const FilterInput = styled("input", {
  base: {
    flexGrow: 1,
    border: 0,
  },
});

const Results = styled("div", {
  base: {
    borderTop: `1px solid ${theme.color.divider.base}`,
    maxHeight: 320,
    padding: theme.space[2],
    overflowY: "auto",
    selectors: {
      "&::-webkit-scrollbar": {
        display: "none",
      },
    },
  },
});

const Category = styled("div", {
  base: {
    display: "flex",
    padding: theme.space[2],
    fontSize: 12,
    alignItems: "center",
    fontWeight: 500,
    color: theme.color.text.primary.surface,
  },
});

const ActionRow = styled("div", {
  base: {
    height: 40,
    padding: `0 ${theme.space[3]}`,
    display: "flex",
    alignItems: "center",
    borderRadius: 4,
    fontSize: 12,
    gap: theme.space[4],
  },
});

globalStyle(`${ActionRow}.active`, {
  background: theme.color.background.hover,
});

const ActionRowIcon = styled("div", {
  base: {
    width: 16,
    height: 16,
    background: "black",
    borderRadius: 4,
  },
});

const ActionRowTitle = styled("div", {
  base: {
    color: theme.color.text.primary.surface,
  },
});

function createControl() {
  const [provider, setProvider] = createSignal<ActionProvider>();
  const [visible, setVisible] = createSignal(false);

  function show() {
    batch(() => {
      setProvider(undefined);
      setVisible(true);
      setInput("");
    });
    control.input().focus();
  }

  function hide() {
    setVisible(false);
  }

  createShortcut(["Control", "K"], () => {
    show();
  });

  createShortcut(["Escape"], () => {
    hide();
  });

  const [actions, setActions] = createSignal<Action[]>([]);
  const [input, setInput] = createSignal("");
  createEffect(async () => {
    const p = provider();
    if (p) {
      setActions(await p(input()));
      return;
    }
    const actions = await Promise.all(
      providers.map(async (provider) => {
        const actions = await provider(input());
        return actions;
      })
    ).then((x) => x.flat());
    setActions(actions);
  });

  const groups = createMemo(() => {
    return pipe(
      actions() || [],
      filter((action) =>
        action.title.toLowerCase().includes(input().toLowerCase())
      ),
      groupBy((a) => a.category)
    );
  });

  createEffect(() => console.log("actions", actions()));

  const control = {
    root: undefined as unknown as HTMLElement,
    input() {
      return control.root.querySelector("input") as HTMLInputElement;
    },
    actions() {
      return [...control.root.querySelectorAll("[data-element='action']")];
    },
    active() {
      return control.root.querySelector(
        "[data-element='action'].active"
      ) as HTMLElement;
    },
    setActive(el: Element) {
      const current = control.active();
      if (current) current.classList.remove("active");
      el.classList.add("active");
      el.scrollIntoView({
        block: "end",
      });
    },
    move(direction: -1 | 1) {
      const current = control.active();
      const all = control.actions();
      if (!current) {
        control.setActive(all[0]);
        return;
      }
      const index = all.indexOf(current);
      const next = all[index + direction];
      control.setActive(next ?? all[direction == 1 ? 0 : all.length - 1]);
    },
    next() {
      return control.move(1);
    },
    back() {
      return control.move(-1);
    },
  };

  createShortcut(["ArrowDown"], () => {
    control.next();
  });

  createShortcut(["ArrowUp"], () => {
    control.back();
  });

  createShortcut(["Enter"], () => {
    const current = control.active();
    if (current) current.click();
  });

  return {
    bind(root: HTMLElement) {
      control.root = root;
    },
    get input() {
      return input();
    },
    setInput,
    setActive: control.setActive,
    get groups() {
      return groups();
    },
    setProvider,
    visible,
    show,
    hide,
  };
}

type Control = ReturnType<typeof createControl>;

export function CommandBar() {
  const location = useLocation();

  const control = createControl();

  return (
    <Root show={control.visible()} ref={control.bind}>
      <Modal>
        <Filter>
          <FilterInput
            onInput={(e) => control.setInput(e.target.value)}
            value={control.input}
            onBlur={(e) => {
              control.hide();
            }}
            autofocus
            placeholder="Type to search"
          />
        </Filter>
        <Results>
          <For each={Object.entries(control.groups)}>
            {([category, actions]) => (
              <>
                <Category>{category}</Category>
                <For each={actions}>
                  {(action) => (
                    <ActionRow
                      onClick={() => {
                        action.run(control);
                      }}
                      onMouseEnter={(e) => control.setActive(e.currentTarget)}
                      data-element="action"
                    >
                      <ActionRowIcon />
                      <ActionRowTitle>{action.title}</ActionRowTitle>
                    </ActionRow>
                  )}
                </For>
              </>
            )}
          </For>
        </Results>
      </Modal>
    </Root>
  );
}
