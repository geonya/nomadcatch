import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router-dom";
import io from "socket.io-client";
import styled from "styled-components";

let socket;
const SERVER_URL =
  process.env.NODE_ENV === "production"
    ? "https://nomadcatch.herokuapp.com/"
    : "http://localhost:4444/";
export default function Chat() {
  const location = useLocation();
  // video
  const myVideoRef = useRef();
  const peerVideoRef = useRef();

  // canvas
  const canvasBoardRef = useRef();
  const cavasContainerRef = useRef();
  const colorPickRefs = useRef([]);
  const eraserRef = useRef();
  const colors = [
    "#c0392b",
    "#e67e22",
    "#f1c40f",
    "#2ecc71",
    "#3498db",
    "blueviolet",
    "#e84393",
    "#2c3e50",
  ];

  const [room, setRoom] = useState("");
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const { register, handleSubmit, setValue } = useForm();

  useEffect(() => {
    const { name, room } = location.state;
    socket = io(SERVER_URL);
    setRoom(room);
    socket.emit("join", { name, room }, (error) => {
      if (error) {
        console.error(error);
      }
    });
  }, [location.state]);

  //message
  useEffect(() => {
    socket.on("message", (message) => {
      setMessages((messages) => [...messages, message]);
    });
    socket.on("roomData", ({ room, users }) => {
      setRoom(room);
      setUsers(users);
    });
    socket.on("question", (question) => {
      setQuestion(question);
    });
  }, []);

  // media setup
  useEffect(() => {
    let peerConnection;
    let stream;
    let dataChannel;
    let context;
    let painting = false;
    let pickedColor = "#2c3e50";
    let lineWidth = 4;

    peerConnection = new RTCPeerConnection();
    const startMedia = async () => {
      const getMedia = async () => {
        const contraints = { audio: false, video: { facingMode: "user" } };
        try {
          stream = await navigator.mediaDevices.getUserMedia(contraints);
          if (myVideoRef.current) {
            myVideoRef.current.srcObject = stream;
          }
        } catch (error) {
          console.error(error);
        }
      };
      const makeConnection = () => {
        if (stream) {
          stream
            .getTracks()
            .forEach((track) => peerConnection.addTrack(track, stream));
        }
      };
      await getMedia();
      makeConnection();
    };

    startMedia();

    peerConnection.ontrack = ({ streams }) => {
      if (peerVideoRef.current) {
        peerVideoRef.current.srcObject = streams[0];
      }
    };
    socket.on("rtc_start", async (room) => {
      canvasClear();
      console.log("RTC Connection Start!");
      peerConnection.addEventListener("icecandidate", ({ candidate }) => {
        console.log("candidate finish");
        socket.emit("candidate", { candidate, room });
      });
      dataChannel = peerConnection.createDataChannel("canvas");

      dataChannel.onmessage = (event) => {
        console.log("data receiving...");
        const parsed = JSON.parse(event.data);
        draw(parsed.payload.data, parsed.payload.painting);
      };
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("offer", { offer, room });
      console.log("send the offer");
    });
    socket.on("offer", async ({ offer, room }) => {
      canvasClear();
      peerConnection.addEventListener("datachannel", (event) => {
        console.log("receive datachannel");
        dataChannel = event.channel;
        if (dataChannel) {
          dataChannel.onmessage = (event) => {
            console.log("data receiving...");
            const parsed = JSON.parse(event.data);
            draw(parsed.payload.data, parsed.payload.painting);
          };
        }
      });
      await peerConnection.setRemoteDescription(offer);
      console.log("receive offer");
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", { answer, room });
      console.log("send answer!");
    });

    socket.on("answer", async ({ answer, room }) => {
      peerConnection.addEventListener("icecandidate", ({ candidate }) => {
        console.log("candidate finish");
        socket.emit("candidate", { candidate, room });
      });
      console.log("receive answer");
      await peerConnection.setRemoteDescription(answer);
    });

    socket.on("candidate", async (candidate) => {
      console.log("receive candidate !");
      if (candidate) {
        await peerConnection.addIceCandidate(candidate);
        console.log("🚀 add ice candidate peer connection finish 🚀 ");
      }
    });

    const makeCanvas = () => {
      context = canvasBoardRef.current.getContext("2d");

      canvasBoardRef.current.width = cavasContainerRef.current.clientWidth;
      canvasBoardRef.current.height = cavasContainerRef.current.clientHeight;

      const onMouseMove = (event) => {
        if (!canvasBoardRef.current) return;
        if (!context) return;

        const data = {
          x: event.offsetX,
          y: event.offsetY,
          color: pickedColor,
          lineWidth,
          lineCap: "round",
        };

        draw(data, painting);

        if (data && dataChannel) {
          dataChannel.send(
            JSON.stringify({ type: "canvas", payload: { data, painting } })
          );
        }
      };

      const startPainting = () => {
        painting = true;
      };
      const stopPainting = () => {
        painting = false;
      };

      // mouse event
      canvasBoardRef.current.onmousemove = (ev) => onMouseMove(ev);
      canvasBoardRef.current.onmousedown = () => startPainting();
      canvasBoardRef.current.onmouseup = () => stopPainting();
      canvasBoardRef.current.onmouseleave = () => stopPainting();

      // touch event
      canvasBoardRef.current.ontouchstart = () => startPainting();
      canvasBoardRef.current.ontouchend = () => stopPainting();
      canvasBoardRef.current.touchcancel = () => stopPainting();
      canvasBoardRef.current.ontouchmove = (ev) => onMouseMove(ev);

      if (colorPickRefs.current) {
        colorPickRefs.current.map((element) =>
          element.addEventListener("click", (event) => {
            lineWidth = 4;
            if (event.target) {
              pickedColor = event.target.id;
            }
          })
        );
      }
      if (eraserRef.current) {
        eraserRef.current.onclick = () => {
          pickedColor = "white";
          lineWidth = 20;
        };
      }
    };

    function draw(data, painting) {
      if (!context) return;
      context.strokeStyle = data.color;
      context.lineWidth = data.lineWidth;
      context.lineCap = data.lineCap;
      if (!painting) {
        context.beginPath();
        context.moveTo(data.x, data.y);
      } else {
        context.lineTo(data.x, data.y);
        context.stroke();
      }
    }
    function canvasClear() {
      if (!context) return;
      if (!canvasBoardRef.current) return;
      context.clearRect(
        0,
        0,
        canvasBoardRef.current.width,
        canvasBoardRef.current.height
      );
    }
    makeCanvas();
  }, []);

  const onValid = ({ message }) => {
    socket.emit("sendMessage", message);
    setValue("message", "");
  };

  const messageEndRef = useRef();
  useEffect(() => {
    messageEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  return (
    <Layout>
      <Container>
        <Header>
          <TitleBox>
            <h1>Nomad Catch</h1>
            <h3>Room : {room}</h3>
          </TitleBox>
          {users ? (
            <Users>
              {users.map(({ name }) => (
                <div key={name}>
                  <OnlineIcon />
                  <span>{name}</span>
                </div>
              ))}
            </Users>
          ) : null}

          <OutButton>
            <a href="/">나가기</a>
          </OutButton>
        </Header>
        <VideoContainer>
          <VideoBox>
            <video ref={myVideoRef} autoPlay muted />
          </VideoBox>
          <StartButton
            onClick={() => {
              socket.emit("question", room);
              socket.emit("rtc_start", room);
            }}
          >
            Start!
          </StartButton>
          <VideoBox>
            <video ref={peerVideoRef} autoPlay muted />
          </VideoBox>
        </VideoContainer>
        <CanvasContainer ref={cavasContainerRef}>
          <CanvasBoard ref={canvasBoardRef} />
          <ToolBox>
            {question ? <Question>Q. {question}</Question> : null}
          </ToolBox>
          <ColorsPickBox>
            {colors.map((color, i) => {
              return (
                <ColorPick
                  id={color}
                  key={i}
                  color={color}
                  ref={(element) => {
                    if (element) {
                      colorPickRefs.current[i] = element;
                    }
                  }}
                />
              );
            })}
            <Eraser ref={eraserRef}>
              <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.662 23l-5.369-5.365c-.195-.195-.293-.45-.293-.707 0-.256.098-.512.293-.707l14.929-14.928c.195-.194.451-.293.707-.293.255 0 .512.099.707.293l7.071 7.073c.196.195.293.451.293.708 0 .256-.097.511-.293.707l-11.216 11.219h5.514v2h-12.343zm3.657-2l-5.486-5.486-1.419 1.414 4.076 4.072h2.829zm6.605-17.581l-10.677 10.68 5.658 5.659 10.676-10.682-5.657-5.657z" />
              </svg>
            </Eraser>
          </ColorsPickBox>
        </CanvasContainer>
        <MessagesContainer>
          <MessagesBox>
            {messages.map((message, i) => (
              <div key={i}>
                <span>{message.user}</span>
                <span>{message.text}</span>
                <span>{message.time}</span>
              </div>
            ))}
            <div ref={messageEndRef} />
          </MessagesBox>

          <MessageForm onSubmit={handleSubmit(onValid)}>
            <MessageInput
              {...register("message", { required: true })}
              placeholder="메시지를 입력하세요."
            />
            <MessageButton>
              <svg
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                ></path>
              </svg>
            </MessageButton>
          </MessageForm>
        </MessagesContainer>
      </Container>
    </Layout>
  );
}

const Layout = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
`;
const Container = styled.div`
  max-width: 375px;
  width: 100%;
  height: 667px;
  border-radius: 20px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: blueviolet;
  width: 100%;
  padding: 10px 20px;
  border-radius: 20px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  h1 {
    font-size: 16px;
    font-weight: 600;
    color: white;
  }
`;

const TitleBox = styled.div`
  h3 {
    margin-top: 5px;
    text-align: center;
    font-size: 10px;
    color: white;
  }
`;
const Users = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-gap: 20px;
  div {
    display: flex;
    align-items: center;
    span {
      font-size: 12px;
      font-weight: 600;
      color: white;
    }
  }
`;
const OnlineIcon = styled.div`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  margin-right: 6px;
  background-color: greenyellow;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;
const OutButton = styled.button`
  background-color: white;
  color: blueviolet;
  width: 35px;
  height: 35px;
  border-radius: 50%;
  text-align: center;
  font-size: 10px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const VideoContainer = styled.div`
  width: 100%;
  height: 150px;
  display: flex;
  justify-content: space-around;
  align-items: center;
`;

const VideoBox = styled.div`
  background-color: blueviolet;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  z-index: 999;
  bottom: -50px;
  right: 0;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  video {
    width: 145px;
    height: 145px;
  }
`;

const StartButton = styled.button`
  align-self: flex-end;
  cursor: pointer;
  background-color: tomato;
  color: white;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  text-align: center;
  margin-bottom: 10px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const CanvasContainer = styled.div`
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  width: 95%;
  height: 250px;
  border-radius: 18px;
  position: relative;
`;
const CanvasBoard = styled.canvas``;

const ColorsPickBox = styled.div`
  position: absolute;
  left: 50%;
  bottom: 5px;
  display: flex;
  transform: translate(-50%, 0);
`;
const ColorPick = styled.div`
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  z-index: 999;
  background-color: ${(props) => props.color};
  margin-right: 5px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
`;

const ToolBox = styled.div`
  position: absolute;
  left: 50%;
  top: 5px;
  display: flex;
  transform: translate(-50%, 0);
`;
const Eraser = styled.div`
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: -5px;
`;
const Question = styled.div`
  margin-top: 3px;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 13px;
`;

const MessagesContainer = styled.div`
  margin-top: 5px;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
`;

const MessagesBox = styled.div`
  margin-top: 19px;
  width: 95%;
  height: 170px;
  padding: 0px 10px 58px 10px;
  overflow-y: scroll;
  border-radius: 18px;
  div {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 4fr 1fr;
    grid-gap: 3px;
    color: gray;
    span:nth-child(1) {
      align-self: flex-start;
      color: blueviolet;
      font-size: 12px;
      font-weight: 600;
    }
    span:nth-child(2) {
      align-self: center;
      color: gray;
      font-size: 13px;
    }
    span:nth-child(3) {
      place-self: flex-end;
      align-self: center;
      color: gray;
      font-size: 10px;
    }
  }
`;
const MessageForm = styled.form`
  width: 95%;
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translate(-50%, 0%);
`;
const MessageInput = styled.input`
  margin-left: 10px;
  width: 90%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  font-size: 12px;
`;
const MessageButton = styled.button`
  width: 35px;
  height: 35px;
  position: absolute;
  right: 15px;
  bottom: 2.5px;
  background-color: blueviolet;
  color: white;
  border-radius: 50%;
  box-shadow: 0 4px 6px rgba(50, 50, 93, 0.11), 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: center;
  align-items: center;
  svg {
    width: 18px;
    height: 18px;
  }
`;
